import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { Camera } from "@/lib/cameras";
import {
  camerasNearRoute,
  type CameraMaxxingResult,
  type PlannedRoute,
  type RoutePoint,
  scoreMaxxedRoute,
  selectCameraWaypoints,
} from "@/lib/route-planning";

export const runtime = "nodejs";

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][];
  };
};

const MAX_DETOUR_RATIO = 1.65;
const MAX_EXTRA_SECONDS = 30 * 60;

function parsePoint(value: string | null): RoutePoint | null {
  if (!value) return null;
  const [latRaw, lngRaw] = value.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function loadCameras(): Promise<Camera[]> {
  const file = path.join(process.cwd(), "public", "data", "cameras.json");
  return JSON.parse(await readFile(file, "utf8")) as Camera[];
}

function osrmUrl(points: RoutePoint[]) {
  const base = (process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
  const profile = process.env.OSRM_PROFILE ?? "foot";
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const qs = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
  });
  return `${base}/route/v1/${profile}/${coords}?${qs.toString()}`;
}

async function fetchOsrmRoute(points: RoutePoint[]): Promise<OsrmRoute> {
  const res = await fetch(osrmUrl(points), {
    headers: { "User-Agent": "TrafficSlopCameraMaxxing/0.1 (local demo)" },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`OSRM ${res.status}`);
  }
  const json = (await res.json()) as { code?: string; message?: string; routes?: OsrmRoute[] };
  const route = json.routes?.[0];
  if (!route || json.code === "InvalidQuery") {
    throw new Error(json.message ?? "No OSRM route");
  }
  return route;
}

function toPlannedRoute(route: OsrmRoute, cameras: Camera[]): PlannedRoute {
  const geometry = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  return {
    geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    cameras: camerasNearRoute(geometry, cameras),
  };
}

function offsetPoint(point: RoutePoint, bearingA: RoutePoint, bearingB: RoutePoint, meters: number): RoutePoint {
  const metersPerLat = 111_320;
  const metersPerLng = Math.cos((point.lat * Math.PI) / 180) * 111_320;
  const dx = (bearingB.lng - bearingA.lng) * metersPerLng;
  const dy = (bearingB.lat - bearingA.lat) * metersPerLat;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return {
    lat: point.lat + (ny * meters) / metersPerLat,
    lng: point.lng + (nx * meters) / metersPerLng,
  };
}

function avoidanceWaypoints(origin: RoutePoint, destination: RoutePoint, normal: PlannedRoute): RoutePoint[][] {
  const geometry = normal.geometry.length >= 3 ? normal.geometry : [origin, destination];
  const mid = geometry[Math.floor(geometry.length / 2)];
  const oneThird = geometry[Math.floor(geometry.length / 3)];
  const twoThird = geometry[Math.floor((geometry.length * 2) / 3)];
  const anchors = [
    [mid],
    [oneThird, twoThird],
  ];
  const distances = [350, 650, -350, -650];
  return anchors.flatMap((anchorSet) =>
    distances.map((meters) => anchorSet.map((p) => offsetPoint(p, origin, destination, meters))),
  );
}

export async function GET(req: NextRequest) {
  try {
    const origin = parsePoint(req.nextUrl.searchParams.get("origin"));
    const destination = parsePoint(req.nextUrl.searchParams.get("destination"));
    const preset = req.nextUrl.searchParams.get("preset") ?? "reasonable";
    const aggressive = preset === "aggressive";
    const slopShy = preset === "slop-shy";

    if (!origin || !destination) {
      return NextResponse.json({ error: "origin and destination must be lat,lng" }, { status: 400 });
    }

    const cameras = await loadCameras();
    const normalOsrm = await fetchOsrmRoute([origin, destination]);
    const normal = toPlannedRoute(normalOsrm, cameras);

    if (slopShy) {
      const shyCandidates: { route: PlannedRoute; score: number }[] = [];
      for (const detourPoints of avoidanceWaypoints(origin, destination, normal)) {
        try {
          const osrmRoute = await fetchOsrmRoute([origin, ...detourPoints, destination]);
          const route = toPlannedRoute(osrmRoute, cameras);
          const detourRatio = route.distanceMeters / Math.max(1, normal.distanceMeters);
          const extraDurationSeconds = route.durationSeconds - normal.durationSeconds;
          if (detourRatio > MAX_DETOUR_RATIO || extraDurationSeconds > MAX_EXTRA_SECONDS) continue;
          shyCandidates.push({
            route,
            score:
              (normal.cameras.length - route.cameras.length) * 1200 -
              Math.max(0, detourRatio - 1) * 500 -
              Math.max(0, extraDurationSeconds / 60) * 10,
          });
        } catch {
          // Continue trying other avoidance probes.
        }
      }

      const bestShy = shyCandidates.sort((a, b) => b.score - a.score)[0]?.route ?? normal;
      const result: CameraMaxxingResult = {
        origin,
        destination,
        normal,
        maxxed: bestShy,
        waypointCameras: [],
        detourRatio: bestShy.distanceMeters / Math.max(1, normal.distanceMeters),
        extraDistanceMeters: bestShy.distanceMeters - normal.distanceMeters,
        extraDurationSeconds: bestShy.durationSeconds - normal.durationSeconds,
      };
      return NextResponse.json(result);
    }

    const counts = aggressive ? [3, 5, 7] : [2, 4, 6];
    const candidateRoutes: { route: PlannedRoute; waypointCameras: Camera[]; score: number }[] = [];

    for (const count of counts) {
      const waypointCameras = selectCameraWaypoints({
        origin,
        destination,
        normalGeometry: normal.geometry,
        cameras,
        count,
        aggressive,
      });
      if (waypointCameras.length === 0) continue;

      try {
        const points = [
          origin,
          ...waypointCameras.map((cam) => ({ lat: cam.latitude, lng: cam.longitude })),
          destination,
        ];
        const osrmRoute = await fetchOsrmRoute(points);
        const route = toPlannedRoute(osrmRoute, cameras);
        const detourRatio = route.distanceMeters / Math.max(1, normal.distanceMeters);
        const extraDurationSeconds = route.durationSeconds - normal.durationSeconds;
        if (detourRatio > MAX_DETOUR_RATIO || extraDurationSeconds > MAX_EXTRA_SECONDS) continue;
        candidateRoutes.push({
          route,
          waypointCameras,
          score: scoreMaxxedRoute({
            normalDistanceMeters: normal.distanceMeters,
            normalDurationSeconds: normal.durationSeconds,
            route,
          }),
        });
      } catch {
        // Try the next waypoint set; public OSRM can reject awkward waypoint combinations.
      }
    }

    const best = candidateRoutes.sort((a, b) => b.score - a.score)[0];
    const maxxed = best?.route ?? normal;
    const result: CameraMaxxingResult = {
      origin,
      destination,
      normal,
      maxxed,
      waypointCameras: best?.waypointCameras ?? [],
      detourRatio: maxxed.distanceMeters / Math.max(1, normal.distanceMeters),
      extraDistanceMeters: maxxed.distanceMeters - normal.distanceMeters,
      extraDurationSeconds: maxxed.durationSeconds - normal.durationSeconds,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "route failed";
    return NextResponse.json(
      {
        error: message,
        hint: "Check OSRM_BASE_URL/OSRM_PROFILE. The public OSRM demo may not support every walking profile.",
      },
      { status: 502 },
    );
  }
}
