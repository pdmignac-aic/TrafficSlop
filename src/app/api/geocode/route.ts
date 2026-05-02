import { NextRequest, NextResponse } from "next/server";
import { parseLatLng } from "@/lib/route-planning";

export const runtime = "nodejs";

type NominatimPlace = {
  display_name: string;
  lat: string;
  lon: string;
};

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json({ error: "q required" }, { status: 400 });
    }

    const rawPoint = parseLatLng(q);
    if (rawPoint) {
      return NextResponse.json({
        results: [{ label: `${rawPoint.lat.toFixed(5)}, ${rawPoint.lng.toFixed(5)}`, ...rawPoint }],
      });
    }

    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      addressdetails: "0",
      limit: "5",
      viewbox: "-74.25909,40.91758,-73.70018,40.4774",
      bounded: "1",
    });

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "User-Agent": "TrafficSlopCameraMaxxing/0.1 (local demo)",
        Accept: "application/json",
      },
      next: { revalidate: 60 * 60 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `geocoder ${res.status}` }, { status: 502 });
    }

    const places = (await res.json()) as NominatimPlace[];
    const results = places
      .map((p) => ({
        label: p.display_name,
        lat: Number(p.lat),
        lng: Number(p.lon),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "geocode failed" },
      { status: 500 },
    );
  }
}
