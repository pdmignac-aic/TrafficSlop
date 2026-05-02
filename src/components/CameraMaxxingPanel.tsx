"use client";

import { useState } from "react";
import type { CameraMaxxingResult, RoutePoint } from "@/lib/route-planning";

type Props = {
  origin: RoutePoint | null;
  routePlan: CameraMaxxingResult | null;
  onRoutePlan: (plan: CameraMaxxingResult | null) => void;
  onBeginMaxxedCommute: () => void;
  commuteActive: boolean;
};

type GeocodeResult = RoutePoint & {
  label: string;
};

type MaxxingPreset = "reasonable" | "aggressive" | "slop-shy";

function miles(meters: number) {
  return (meters / 1609.344).toFixed(1);
}

function minutes(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

export default function CameraMaxxingPanel({
  origin,
  routePlan,
  onRoutePlan,
  onBeginMaxxedCommute,
  commuteActive,
}: Props) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [preset, setPreset] = useState<MaxxingPreset>("reasonable");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planRoute = async () => {
    if (!origin) {
      setError("Allow location first so we know where to start.");
      return;
    }
    if (!destination.trim()) {
      setError("Enter an end location.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const geo = await fetch(`/api/geocode?q=${encodeURIComponent(destination)}`);
      const geoJson = (await geo.json()) as { results?: GeocodeResult[]; error?: string };
      if (!geo.ok || !geoJson.results?.length) {
        throw new Error(geoJson.error ?? "Destination not found.");
      }
      const dest = geoJson.results[0];
      const params = new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${dest.lat},${dest.lng}`,
        preset,
      });
      const route = await fetch(`/api/routes/camera-maxxing?${params.toString()}`);
      const routeJson = (await route.json()) as CameraMaxxingResult & { error?: string; hint?: string };
      if (!route.ok) {
        throw new Error(routeJson.hint ? `${routeJson.error}. ${routeJson.hint}` : routeJson.error ?? "Route failed.");
      }
      onRoutePlan(routeJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Route failed.");
      onRoutePlan(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-[#0b3b8c]/15 bg-white/80 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="block text-xs font-semibold text-[#0b3b8c]">Try Camera Maxxing</span>
          <span className="mt-1 block text-[11px] text-[#5c6478]">
            Plan a weirder walk: hit more cameras, or route like a folk hero and dodge them.
          </span>
        </span>
        <span className="text-xs font-semibold text-[#0b3b8c]">{open ? "Hide" : "Plan"}</span>
      </button>

      {open ? (
        <div className="mt-4 space-y-3">
          <label className="block text-[11px] font-semibold text-[#1a1f2e]">
            End location
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Times Square, 11 Madison Ave, or 40.758,-73.985"
              className="mt-1 w-full rounded-lg border border-[#1a1f2e]/15 bg-white px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreset("reasonable")}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                preset === "reasonable" ? "bg-[#0b3b8c] text-white" : "bg-[#f0ebe3] text-[#5c6478]"
              }`}
            >
              Reasonable
            </button>
            <button
              type="button"
              onClick={() => setPreset("aggressive")}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                preset === "aggressive" ? "bg-[#0b3b8c] text-white" : "bg-[#f0ebe3] text-[#5c6478]"
              }`}
            >
              Aggressive
            </button>
            <button
              type="button"
              onClick={() => setPreset("slop-shy")}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                preset === "slop-shy" ? "bg-[#0b3b8c] text-white" : "bg-[#f0ebe3] text-[#5c6478]"
              }`}
            >
              Slop shy / folk hero route
            </button>
          </div>

          <button
            type="button"
            disabled={busy || !origin}
            onClick={() => void planRoute()}
            className="rounded-xl bg-[#0b3b8c] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Maxxing…" : preset === "slop-shy" ? "Find slop-shy route" : "Find camera-maxxed route"}
          </button>

          {error ? <p className="text-xs leading-relaxed text-red-700">{error}</p> : null}

          {routePlan ? (
            <div className="space-y-3 rounded-xl border border-[#1a1f2e]/10 bg-[#faf6ef] p-3">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-white p-2">
                  <p className="font-semibold text-[#5c6478]">Normal</p>
                  <p className="font-mono-caught text-[#1a1f2e]">
                    {miles(routePlan.normal.distanceMeters)} mi · {minutes(routePlan.normal.durationSeconds)} min ·{" "}
                    {routePlan.normal.cameras.length} cams
                  </p>
                </div>
                <div className="rounded-lg bg-white p-2">
                  <p className="font-semibold text-[#0b3b8c]">Maxxed</p>
                  <p className="font-mono-caught text-[#1a1f2e]">
                    {miles(routePlan.maxxed.distanceMeters)} mi · {minutes(routePlan.maxxed.durationSeconds)} min ·{" "}
                    {routePlan.maxxed.cameras.length} cams
                  </p>
                </div>
              </div>
              {preset === "slop-shy" ? (
                <p className="text-[11px] leading-relaxed text-[#5c6478]">
                  Adds ~{minutes(Math.max(0, routePlan.extraDurationSeconds))} min and{" "}
                  {miles(Math.max(0, routePlan.extraDistanceMeters))} mi to dodge{" "}
                  {Math.max(0, routePlan.normal.cameras.length - routePlan.maxxed.cameras.length)} cameras.
                </p>
              ) : (
                <p className="text-[11px] leading-relaxed text-[#5c6478]">
                  Adds ~{minutes(Math.max(0, routePlan.extraDurationSeconds))} min and{" "}
                  {miles(Math.max(0, routePlan.extraDistanceMeters))} mi to pass{" "}
                  {Math.max(0, routePlan.maxxed.cameras.length - routePlan.normal.cameras.length)} more cameras.
                </p>
              )}
              <button
                type="button"
                disabled={commuteActive}
                onClick={onBeginMaxxedCommute}
                className="rounded-lg border border-[#0b3b8c]/30 px-3 py-2 text-xs font-semibold text-[#0b3b8c] disabled:opacity-40"
              >
                Begin maxxed commute
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
