import type { Camera } from "@/lib/cameras";
import { haversineMeters } from "@/lib/geo";

export type RoutePoint = {
  lat: number;
  lng: number;
};

export type RouteCameraHit = Camera & {
  metersFromRoute: number;
};

export type PlannedRoute = {
  geometry: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  cameras: RouteCameraHit[];
};

export type CameraMaxxingResult = {
  origin: RoutePoint;
  destination: RoutePoint;
  normal: PlannedRoute;
  maxxed: PlannedRoute;
  waypointCameras: Camera[];
  detourRatio: number;
  extraDistanceMeters: number;
  extraDurationSeconds: number;
};

type ScoredCamera = Camera & {
  metersFromRoute: number;
  metersFromOrigin: number;
  metersFromDestination: number;
  score: number;
};

const CAMERA_CAPTURE_RADIUS_M = 75;
const MIN_WAYPOINT_SPACING_M = 180;
const ROUTE_CORRIDOR_M = 900;

function projectMeters(point: RoutePoint, origin: RoutePoint) {
  const metersPerLat = 111_320;
  const metersPerLng = Math.cos((origin.lat * Math.PI) / 180) * 111_320;
  return {
    x: (point.lng - origin.lng) * metersPerLng,
    y: (point.lat - origin.lat) * metersPerLat,
  };
}

function pointToSegmentMeters(point: RoutePoint, a: RoutePoint, b: RoutePoint): number {
  const p = projectMeters(point, a);
  const pA = projectMeters(a, a);
  const pB = projectMeters(b, a);
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  if (dx === 0 && dy === 0) return haversineMeters(point.lat, point.lng, a.lat, a.lng);
  const t = Math.max(0, Math.min(1, ((p.x - pA.x) * dx + (p.y - pA.y) * dy) / (dx * dx + dy * dy)));
  const closest = { x: pA.x + t * dx, y: pA.y + t * dy };
  const dX = p.x - closest.x;
  const dY = p.y - closest.y;
  return Math.sqrt(dX * dX + dY * dY);
}

export function pointToRouteMeters(point: RoutePoint, geometry: RoutePoint[]): number {
  if (geometry.length === 0) return Infinity;
  if (geometry.length === 1) {
    return haversineMeters(point.lat, point.lng, geometry[0].lat, geometry[0].lng);
  }

  let best = Infinity;
  for (let i = 1; i < geometry.length; i++) {
    const d = pointToSegmentMeters(point, geometry[i - 1], geometry[i]);
    if (d < best) best = d;
  }
  return best;
}

export function camerasNearRoute(
  geometry: RoutePoint[],
  cameras: Camera[],
  radiusMeters = CAMERA_CAPTURE_RADIUS_M,
): RouteCameraHit[] {
  return cameras
    .map((cam) => ({
      ...cam,
      metersFromRoute: pointToRouteMeters({ lat: cam.latitude, lng: cam.longitude }, geometry),
    }))
    .filter((cam) => cam.metersFromRoute <= radiusMeters)
    .sort((a, b) => a.metersFromRoute - b.metersFromRoute);
}

function isInsideLooseBBox(point: RoutePoint, origin: RoutePoint, destination: RoutePoint, padDeg: number) {
  const minLat = Math.min(origin.lat, destination.lat) - padDeg;
  const maxLat = Math.max(origin.lat, destination.lat) + padDeg;
  const minLng = Math.min(origin.lng, destination.lng) - padDeg;
  const maxLng = Math.max(origin.lng, destination.lng) + padDeg;
  return point.lat >= minLat && point.lat <= maxLat && point.lng >= minLng && point.lng <= maxLng;
}

export function selectCameraWaypoints(options: {
  origin: RoutePoint;
  destination: RoutePoint;
  normalGeometry: RoutePoint[];
  cameras: Camera[];
  count: number;
  aggressive?: boolean;
}): Camera[] {
  const { origin, destination, normalGeometry, cameras, count, aggressive = false } = options;
  const corridor = aggressive ? ROUTE_CORRIDOR_M * 1.45 : ROUTE_CORRIDOR_M;
  const bboxPad = aggressive ? 0.035 : 0.025;

  const scored: ScoredCamera[] = cameras
    .filter((cam) => isInsideLooseBBox({ lat: cam.latitude, lng: cam.longitude }, origin, destination, bboxPad))
    .map((cam) => {
      const point = { lat: cam.latitude, lng: cam.longitude };
      const metersFromRoute = pointToRouteMeters(point, normalGeometry);
      const metersFromOrigin = haversineMeters(origin.lat, origin.lng, cam.latitude, cam.longitude);
      const metersFromDestination = haversineMeters(destination.lat, destination.lng, cam.latitude, cam.longitude);
      const endpointPenalty = Math.min(metersFromOrigin, metersFromDestination) < 120 ? 350 : 0;
      const score = Math.max(0, corridor - metersFromRoute) - endpointPenalty;
      return { ...cam, metersFromRoute, metersFromOrigin, metersFromDestination, score };
    })
    .filter((cam) => cam.metersFromRoute <= corridor)
    .sort((a, b) => b.score - a.score);

  const picked: ScoredCamera[] = [];
  for (const cam of scored) {
    const tooClose = picked.some(
      (p) => haversineMeters(p.latitude, p.longitude, cam.latitude, cam.longitude) < MIN_WAYPOINT_SPACING_M,
    );
    if (tooClose) continue;
    picked.push(cam);
    if (picked.length >= count) break;
  }

  return picked
    .sort((a, b) => a.metersFromOrigin - b.metersFromOrigin)
    .map((cam) => ({
      id: cam.id,
      name: cam.name,
      latitude: cam.latitude,
      longitude: cam.longitude,
    }));
}

export function scoreMaxxedRoute(options: {
  normalDistanceMeters: number;
  normalDurationSeconds: number;
  route: PlannedRoute;
}) {
  const { normalDistanceMeters, normalDurationSeconds, route } = options;
  const detourRatio = route.distanceMeters / Math.max(1, normalDistanceMeters);
  const extraDurationSeconds = route.durationSeconds - normalDurationSeconds;
  const cameraScore = route.cameras.length * 1000;
  const detourPenalty = Math.max(0, detourRatio - 1) * 600 + Math.max(0, extraDurationSeconds / 60) * 12;
  return cameraScore - detourPenalty;
}

export function parseLatLng(value: string): RoutePoint | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
