"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CameraMaxxingPanel from "@/components/CameraMaxxingPanel";
import CaughtMap from "@/components/CaughtMap";
import type { Camera } from "@/lib/cameras";
import { fetchCameraList, imageProxyUrl } from "@/lib/cameras";
import { haversineMeters, nearestCamera } from "@/lib/geo";
import { buildMontageBlob } from "@/lib/montage";
import type { CameraMaxxingResult } from "@/lib/route-planning";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { addRollEntry, loadRoll, replaceRoll, type RollEntry } from "@/lib/roll";

const HAS_CLOUD =
  typeof process !== "undefined" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Inside this radius we burst-capture up to SHOTS_PER_PASS frames. */
const CAPTURE_RADIUS_M = 75;
/** Wider ring: first time you enter, we toast a traffic-cam warning. */
const WARN_RADIUS_M = 140;
/** Leave this far before a camera pass resets (avoids flicker at the edge). */
const PASS_RESET_BEYOND_M = 98;
/** Frames per pass while you stay in range. */
const SHOTS_PER_PASS = 5;
/** Minimum gap between burst frames (same camera). */
const BURST_GAP_MS = 3200;
/** How often we run proximity / burst logic (position still updates every tick). */
const LOGIC_INTERVAL_MS = 550;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function randomKey() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type CamPass = { count: number; lastAt: number };

export default function CaughtApp() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [camerasError, setCamerasError] = useState<string | null>(null);
  const [roll, setRoll] = useState<RollEntry[]>([]);
  const [catching, setCatching] = useState(false);
  const [user, setUser] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [montageBusy, setMontageBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [activeCommuteId, setActiveCommuteId] = useState<string | null>(null);
  const [commuteBusy, setCommuteBusy] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [selectedCaptureBusy, setSelectedCaptureBusy] = useState(false);
  const [cameraMaxxingRoute, setCameraMaxxingRoute] = useState<CameraMaxxingResult | null>(null);
  const [publishFor, setPublishFor] = useState<RollEntry | null>(null);
  const [myCompanies, setMyCompanies] = useState<{ id: string; name: string; slug: string }[]>([]);
  const commuteIdRef = useRef<string | null>(null);

  const camerasRef = useRef(cameras);
  camerasRef.current = cameras;

  const passByCamRef = useRef<Record<string, CamPass>>({});
  const warnShownRef = useRef<Set<string>>(new Set());
  const captureBusyRef = useRef(false);
  const lastLogicAtRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const prevCatchingRef = useRef(false);

  useEffect(() => {
    commuteIdRef.current = activeCommuteId;
  }, [activeCommuteId]);

  useEffect(() => {
    let cancelled = false;
    async function loadRollFromCloud() {
      if (!HAS_CLOUD) {
        setRoll(loadRoll());
        return;
      }
      try {
        const r = await fetch("/api/roll");
        if (!r.ok) throw new Error("roll");
        const j = (await r.json()) as {
          items: {
            id: string;
            camera_id: string;
            label: string;
            captured_at: number;
            public_url: string;
          }[];
        };
        const mapped: RollEntry[] = (j.items ?? []).map((it) => ({
          key: it.id,
          dbId: it.id,
          cameraId: it.camera_id,
          label: it.label,
          capturedAt: it.captured_at,
          imageDataUrl: it.public_url,
        }));
        if (!cancelled) setRoll(mapped);
      } catch {
        if (!cancelled) setRoll(loadRoll());
      }
    }
    void loadRollFromCloud();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!HAS_CLOUD || !publishFor) return;
    void (async () => {
      try {
        const r = await fetch("/api/my-companies");
        if (!r.ok) return;
        const j = (await r.json()) as { companies: { id: string; name: string; slug: string }[] };
        setMyCompanies(j.companies ?? []);
      } catch {
        setMyCompanies([]);
      }
    })();
  }, [publishFor]);

  useEffect(() => {
    if (catching && !prevCatchingRef.current) {
      passByCamRef.current = {};
      warnShownRef.current = new Set();
      lastLogicAtRef.current = 0;
    }
    prevCatchingRef.current = catching;
  }, [catching]);

  useEffect(() => {
    fetchCameraList()
      .then(setCameras)
      .catch(() => setCamerasError("Run `npm run fetch-cameras` then refresh."));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(t);
  }, [toast]);

  const pushToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const captureFrame = useCallback(async (cam: Camera) => {
    const now = Date.now();

    if (!HAS_CLOUD) {
      const res = await fetch(imageProxyUrl(cam.id), { cache: "no-store" });
      if (!res.ok) throw new Error("Cam frame failed");
      const blob = await res.blob();
      const imageDataUrl = await blobToDataUrl(blob);
      const entry: RollEntry = {
        key: randomKey(),
        cameraId: cam.id,
        label: cam.name,
        capturedAt: now,
        imageDataUrl,
      };
      setRoll((prev) => addRollEntry(prev, entry));
      return;
    }

    const supabase = createBrowserSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const res = await fetch(imageProxyUrl(cam.id), { cache: "no-store" });
      if (!res.ok) throw new Error("Cam frame failed");
      const blob = await res.blob();
      const imageDataUrl = await blobToDataUrl(blob);
      setRoll((prev) =>
        addRollEntry(prev, {
          key: randomKey(),
          cameraId: cam.id,
          label: cam.name,
          capturedAt: now,
          imageDataUrl,
        }),
      );
      return;
    }

    const ins = await fetch("/api/captures/from-camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        camera_id: cam.id,
        label: cam.name,
        commute_id: commuteIdRef.current,
      }),
    });
    if (!ins.ok) {
      const localRes = await fetch(imageProxyUrl(cam.id), { cache: "no-store" });
      if (!localRes.ok) throw new Error("save failed");
      const blob = await localRes.blob();
      const imageDataUrl = await blobToDataUrl(blob);
      setRoll((prev) =>
        addRollEntry(prev, {
          key: randomKey(),
          cameraId: cam.id,
          label: cam.name,
          capturedAt: now,
          imageDataUrl,
        }),
      );
      setStatus("saved locally");
      return;
    }
    const saved = (await ins.json()) as { id: string; public_url: string; captured_at: number };
    const entry: RollEntry = {
      key: saved.id,
      dbId: saved.id,
      cameraId: cam.id,
      label: cam.name,
      capturedAt: saved.captured_at ?? now,
      imageDataUrl: saved.public_url,
    };
    setRoll((prev) => [entry, ...prev].slice(0, 200));
  }, []);

  const processGeoLogic = useCallback(
    async (lat: number, lng: number) => {
      if (!catching) return;
      const cams = camerasRef.current;
      if (!cams.length) return;

      const now = Date.now();
      if (now - lastLogicAtRef.current < LOGIC_INTERVAL_MS) return;
      lastLogicAtRef.current = now;

      const pass = passByCamRef.current;
      const warned = warnShownRef.current;

      for (const cam of cams) {
        const d = haversineMeters(lat, lng, cam.latitude, cam.longitude);
        if (d > WARN_RADIUS_M + 30) {
          warned.delete(cam.id);
        }
        if (d > PASS_RESET_BEYOND_M) {
          delete pass[cam.id];
        }
      }

      const warnHit = cams
        .map((cam) => ({
          cam,
          d: haversineMeters(lat, lng, cam.latitude, cam.longitude),
        }))
        .filter((x) => x.d > CAPTURE_RADIUS_M && x.d <= WARN_RADIUS_M)
        .sort((a, b) => a.d - b.d)[0];
      if (warnHit && !warned.has(warnHit.cam.id)) {
        warned.add(warnHit.cam.id);
        pushToast(`Traffic Slop is about to see you — ${warnHit.cam.name}`);
      }

      const inRange = cams
        .map((cam) => ({
          cam,
          d: haversineMeters(lat, lng, cam.latitude, cam.longitude),
        }))
        .filter((x) => x.d <= CAPTURE_RADIUS_M)
        .sort((a, b) => a.d - b.d);

      for (const { cam } of inRange) {
        if (captureBusyRef.current) break;
        let p = pass[cam.id];
        if (!p) p = { count: 0, lastAt: 0 };
        if (p.count >= SHOTS_PER_PASS) continue;
        if (p.count > 0 && now - p.lastAt < BURST_GAP_MS) continue;

        captureBusyRef.current = true;
        try {
          await captureFrame(cam);
          const t = Date.now();
          pass[cam.id] = { count: p.count + 1, lastAt: t };
          setStatus(`traffic slopped ${p.count + 1}/${SHOTS_PER_PASS}`);
          window.setTimeout(() => setStatus(""), 1400);
        } catch {
          setStatus("capture failed");
        } finally {
          captureBusyRef.current = false;
        }
        break;
      }
    },
    [captureFrame, catching, pushToast],
  );

  useEffect(() => {
    if (!catching) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGeoDenied(false);
      return;
    }

    if (!navigator.geolocation) {
      setStatus("no geolocation");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUser({ lat, lng });
        setAccuracyM(
          typeof pos.coords.accuracy === "number" && Number.isFinite(pos.coords.accuracy)
            ? pos.coords.accuracy
            : null,
        );
        setGeoDenied(false);
        void processGeoLogic(lat, lng);
      },
      () => {
        setGeoDenied(true);
        setStatus("location blocked");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 25_000 },
    );

    watchIdRef.current = watchId;

    return () => {
      navigator.geolocation.clearWatch(watchId);
      watchIdRef.current = null;
    };
  }, [catching, processGeoLogic]);

  const nearest = useMemo(() => {
    if (!user || !cameras.length) return null;
    return nearestCamera(user.lat, user.lng, cameras);
  }, [user, cameras]);

  const manualCatch = async () => {
    if (!cameras.length) return;
    setStatus("catching…");
    try {
      if (!navigator.geolocation) throw new Error("no geo");
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 5_000,
          timeout: 20_000,
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setUser({ lat, lng });
      const n = nearestCamera(lat, lng, cameras);
      if (!n) throw new Error("no cam");
      for (let i = 0; i < SHOTS_PER_PASS; i++) {
        await captureFrame(n.cam);
        setStatus(`manual ${i + 1}/${SHOTS_PER_PASS}`);
        if (i < SHOTS_PER_PASS - 1) await sleep(BURST_GAP_MS);
      }
      setStatus("traffic slopped");
      window.setTimeout(() => setStatus(""), 1600);
    } catch {
      setStatus("manual catch failed");
    }
  };

  const captureSelectedCamera = async (burst: boolean) => {
    if (!selectedCamera) return;
    setSelectedCaptureBusy(true);
    try {
      const total = burst ? SHOTS_PER_PASS : 1;
      for (let i = 0; i < total; i++) {
        await captureFrame(selectedCamera);
        setStatus(burst ? `selected ${i + 1}/${total}` : "captured selected cam");
        if (i < total - 1) await sleep(BURST_GAP_MS);
      }
      pushToast(burst ? `Auto-captured ${total} frames from ${selectedCamera.name}` : "Captured.");
      window.setTimeout(() => setStatus(""), 1600);
    } catch {
      setStatus("selected capture failed");
    } finally {
      setSelectedCaptureBusy(false);
    }
  };

  const startCommute = async () => {
    if (!HAS_CLOUD) {
      setCatching(true);
      pushToast("Commute started locally — sign in + Supabase enables email.");
      return;
    }
    setCommuteBusy(true);
    try {
      const r = await fetch("/api/commutes/start", { method: "POST" });
      if (!r.ok) throw new Error("start failed");
      const j = (await r.json()) as { commute: { id: string } };
      setActiveCommuteId(j.commute.id);
      setCatching(true);
      pushToast("Commute started — live capture is on.");
    } catch {
      setStatus("commute start failed");
    } finally {
      setCommuteBusy(false);
    }
  };

  const endCommuteEmail = async () => {
    setCatching(false);
    if (!activeCommuteId) {
      pushToast("Commute stopped.");
      return;
    }
    if (!HAS_CLOUD) return;
    setCommuteBusy(true);
    try {
      const r = await fetch("/api/commutes/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commute_id: activeCommuteId }),
      });
      const j = (await r.json()) as { ok?: boolean; emailed?: boolean; warning?: string };
      if (!r.ok) throw new Error("end failed");
      setActiveCommuteId(null);
      pushToast(j.warning ? `Ended — ${j.warning}` : j.emailed ? "Ended — check your email." : "Ended — no frames in this commute.");
    } catch {
      setStatus("commute end failed");
    } finally {
      setCommuteBusy(false);
    }
  };

  const makeMontage = async () => {
    if (!roll.length) return;
    const entries = roll;
    setMontageBusy(true);
    setStatus("rendering…");
    try {
      const blob = await buildMontageBlob(entries.slice(0, 60));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `traffic-slop-montage.webm`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      setStatus("saved");
      window.setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "montage failed");
    } finally {
      setMontageBusy(false);
    }
  };

  const loadDemoRoll = async () => {
    try {
      const res = await fetch("/demo-roll.json", { cache: "force-cache" });
      if (!res.ok) throw new Error("no demo");
      const data = (await res.json()) as {
        entries: Array<{
          cameraId: string;
          label: string;
          capturedAt: number;
          imagePath: string;
        }>;
      };
      const built: RollEntry[] = [];
      for (const e of data.entries) {
        const img = await fetch(e.imagePath);
        const blob = await img.blob();
        const imageDataUrl = await blobToDataUrl(blob);
        built.push({
          key: randomKey(),
          cameraId: e.cameraId,
          label: e.label,
          capturedAt: e.capturedAt,
          imageDataUrl,
        });
      }
      setRoll(replaceRoll(built));
      setStatus("demo roll loaded");
      window.setTimeout(() => setStatus(""), 1600);
    } catch {
      setStatus("demo unavailable");
    }
  };

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-12 pt-8">
      {toast ? (
        <div
          role="status"
          className="caught-toast fixed left-1/2 top-4 z-[1000] w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border border-[#0b3b8c]/20 bg-white px-4 py-3 text-center text-sm font-medium leading-snug text-[#0b3b8c] shadow-lg shadow-[#0b3b8c]/10"
        >
          {toast}
        </div>
      ) : null}

      <header className="mb-8 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-[#0b3b8c]/80">
          Traffic Slop
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1f2e]">
          Someone&apos;s been filming you.
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-[#5c6478]">
          It&apos;s the city. It&apos;s been doing it for years. We just started saving it for
          you. Or helping you avoid them.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {catching ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-[#0b3b8c]/25 bg-white px-3 py-1 text-xs font-medium text-[#0b3b8c] shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e63946] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e63946]" />
            </span>
            Live tracking
          </span>
        ) : (
          <span className="rounded-full border border-[#1a1f2e]/10 bg-[#f0ebe3] px-3 py-1 text-xs text-[#5c6478]">
            Tracking paused
          </span>
        )}
        {accuracyM != null && user ? (
          <span className="text-[11px] text-[#5c6478]">GPS ±{Math.round(accuracyM)}m</span>
        ) : null}
      </div>

      <p className="mb-4 text-xs leading-relaxed text-[#5c6478]">
        Tap Begin commute before you walk. Keep this tab open on iPhone. Near a cam you&apos;ll
        get a heads-up, then up to {SHOTS_PER_PASS} frames per pass while you stay in range (~
        {CAPTURE_RADIUS_M}m).
      </p>

      {camerasError ? (
        <p className="mb-3 text-sm text-red-700">{camerasError}</p>
      ) : null}
      {geoDenied ? (
        <p className="mb-3 text-sm text-red-700">
          Location permission is off — enable it for live capture, or use Catch nearest.
        </p>
      ) : null}

      <CaughtMap
        cameras={cameras}
        user={user}
        selectedCameraId={selectedCamera?.id ?? null}
        onCameraSelect={setSelectedCamera}
        routePlan={cameraMaxxingRoute}
      />

      {selectedCamera ? (
        <CameraInspector
          camera={selectedCamera}
          busy={selectedCaptureBusy}
          onClose={() => setSelectedCamera(null)}
          onCapture={() => void captureSelectedCamera(false)}
          onAutoCapture={() => void captureSelectedCamera(true)}
        />
      ) : (
        <p className="mt-3 text-[11px] text-[#5c6478]">
          Tap any cobalt camera dot to preview that live DOT still and capture from it directly.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-[#0b3b8c]/15 bg-white/80 p-4">
        <p className="mb-2 text-xs font-semibold text-[#0b3b8c]">Commute mode</p>
        <p className="mb-3 text-[11px] leading-relaxed text-[#5c6478]">
          Begin commute starts live GPS tracking and traffic-cam capture. End commute stops capture
          and emails this run to your account.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={commuteBusy || catching || Boolean(activeCommuteId)}
            onClick={() => void startCommute()}
            className="rounded-lg bg-[#0b3b8c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Begin commute
          </button>
          <button
            type="button"
            disabled={commuteBusy || (!catching && !activeCommuteId)}
            onClick={() => void endCommuteEmail()}
            className="rounded-lg border border-[#0b3b8c]/30 px-3 py-2 text-xs font-semibold text-[#0b3b8c] disabled:opacity-40"
          >
            End commute
          </button>
          {catching || activeCommuteId ? (
            <span className="self-center font-mono-caught text-[10px] text-[#5c6478]">
              {catching ? "live capture active" : "email pending"}
            </span>
          ) : null}
        </div>
      </div>

      <CameraMaxxingPanel
        origin={user}
        routePlan={cameraMaxxingRoute}
        onRoutePlan={setCameraMaxxingRoute}
        onBeginMaxxedCommute={() => void startCommute()}
        commuteActive={catching || Boolean(activeCommuteId)}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={montageBusy || roll.length === 0}
          onClick={() => void makeMontage()}
          className="rounded-xl border-2 border-[#0b3b8c] bg-white px-5 py-3 text-sm font-semibold text-[#0b3b8c] transition hover:bg-[#f0ebe3] disabled:cursor-not-allowed disabled:border-[#1a1f2e]/15 disabled:text-[#5c6478]/50"
        >
          Make my montage
        </button>
        <button
          type="button"
          onClick={() => void manualCatch()}
          className="rounded-xl border border-[#1a1f2e]/15 bg-[#f0ebe3] px-5 py-3 text-sm font-semibold text-[#1a1f2e] hover:bg-[#e8e2d8]"
        >
          Catch nearest ×{SHOTS_PER_PASS}
        </button>
      </div>

      <p className="mt-3 text-[11px] text-[#5c6478]">
        Montage: 15s WebM — Chrome is most reliable; iOS may need a desktop step for export.
      </p>

      {nearest ? (
        <p className="font-mono-caught mt-2 text-[11px] text-[#5c6478]">
          nearest cam {Math.round(nearest.meters)}m · {nearest.cam.name}
        </p>
      ) : null}

      {status ? (
        <p className="font-mono-caught mt-2 text-[11px] uppercase tracking-wider text-[#0b3b8c]/70">
          {status}
        </p>
      ) : null}

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-[#0b3b8c]/80">
            Roll
          </h2>
          <span className="font-mono-caught text-[11px] text-[#5c6478]">
            {roll.length} frame{roll.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {roll.map((e) => (
            <figure
              key={e.key}
              className="overflow-hidden rounded-xl border border-[#1a1f2e]/8 bg-white shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.imageDataUrl}
                alt=""
                className="w-full bg-[#f0ebe3] object-contain"
                style={{ imageRendering: "pixelated" }}
              />
              <figcaption className="font-mono-caught border-t border-[#1a1f2e]/6 px-2 py-2 text-[10px] leading-snug text-[#5c6478]">
                {new Date(e.capturedAt).toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
                <br />
                <span className="text-[#1a1f2e]">{e.label}</span>
                {HAS_CLOUD && e.dbId ? (
                  <button
                    type="button"
                    className="mt-1 block w-full text-left text-[10px] font-semibold text-[#0b3b8c] underline"
                    onClick={() => setPublishFor(e)}
                  >
                    Publish…
                  </button>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
        {roll.length === 0 ? (
          <p className="mt-4 text-sm text-[#5c6478]">Nothing on your roll yet.</p>
        ) : null}
      </section>

      <button
        type="button"
        aria-label="load demo roll"
        onClick={() => void loadDemoRoll()}
        className="fixed bottom-3 right-3 h-8 w-8 rounded-full border border-[#0b3b8c]/15 bg-white/90 text-[0px] text-transparent shadow-sm backdrop-blur hover:bg-white"
      >
        ·
      </button>

      {publishFor && publishFor.dbId ? (
        <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#faf6ef] p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-[#0b3b8c]">Publish to Community</h3>
            <p className="mt-1 text-xs text-[#5c6478]">
              Optional — semi-public feed. One publish per capture.
            </p>
            <PublishForm
              captureId={publishFor.dbId}
              companies={myCompanies}
              onClose={() => setPublishFor(null)}
              onDone={() => {
                setPublishFor(null);
                pushToast("Published.");
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PublishForm({
  captureId,
  companies,
  onClose,
  onDone,
}: {
  captureId: string;
  companies: { id: string; name: string; slug: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [vis, setVis] = useState<"general" | "company">("general");
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "");
  const [entryAt, setEntryAt] = useState("");
  const [exitAt, setExitAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/feed/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capture_id: captureId,
          visibility: vis,
          company_id: vis === "company" ? companyId : null,
          entry_at: vis === "company" && entryAt ? new Date(entryAt).toISOString() : null,
          exit_at: vis === "company" && exitAt ? new Date(exitAt).toISOString() : null,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "publish failed");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <label className="flex items-center gap-2 text-xs text-[#1a1f2e]">
        <input
          type="radio"
          name="v"
          checked={vis === "general"}
          onChange={() => setVis("general")}
        />
        General NYC feed
      </label>
      <label className="flex items-center gap-2 text-xs text-[#1a1f2e]">
        <input
          type="radio"
          name="v"
          checked={vis === "company"}
          onChange={() => setVis("company")}
        />
        Company feed
      </label>
      {vis === "company" ? (
        <div className="space-y-2">
          <select
            className="w-full rounded-lg border border-[#1a1f2e]/15 bg-white px-2 py-2 text-xs"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {companies.length === 0 ? (
              <option value="">Join a company on the Community page</option>
            ) : null}
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug})
              </option>
            ))}
          </select>
          <label className="block text-[10px] text-[#5c6478]">
            Entry (optional)
            <input
              type="datetime-local"
              value={entryAt}
              onChange={(e) => setEntryAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#1a1f2e]/15 bg-white px-2 py-1 text-xs"
            />
          </label>
          <label className="block text-[10px] text-[#5c6478]">
            Exit (optional)
            <input
              type="datetime-local"
              value={exitAt}
              onChange={(e) => setExitAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#1a1f2e]/15 bg-white px-2 py-1 text-xs"
            />
          </label>
        </div>
      ) : null}
      {err ? <p className="text-xs text-red-700">{err}</p> : null}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-[#1a1f2e]/15 py-2 text-xs font-semibold text-[#5c6478]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || (vis === "company" && !companyId)}
          onClick={() => void submit()}
          className="flex-1 rounded-lg bg-[#0b3b8c] py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
    </div>
  );
}

function CameraInspector({
  camera,
  busy,
  onClose,
  onCapture,
  onAutoCapture,
}: {
  camera: Camera;
  busy: boolean;
  onClose: () => void;
  onCapture: () => void;
  onAutoCapture: () => void;
}) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    setTick(Date.now());
    const id = window.setInterval(() => setTick(Date.now()), 2500);
    return () => window.clearInterval(id);
  }, [camera.id]);

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-[#0b3b8c]/15 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-[#1a1f2e]/8 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0b3b8c]/70">
            Camera view
          </p>
          <h2 className="mt-1 text-sm font-semibold text-[#1a1f2e]">{camera.name}</h2>
          <p className="font-mono-caught mt-1 text-[10px] text-[#5c6478]">
            {camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[#1a1f2e]/10 px-2 py-1 text-[10px] font-semibold text-[#5c6478]"
        >
          Close
        </button>
      </div>

      <div className="bg-[#f0ebe3] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${imageProxyUrl(camera.id)}?t=${tick}`}
          alt={`Live traffic camera still for ${camera.name}`}
          className="mx-auto max-h-64 w-full object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      <div className="space-y-2 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-[#5c6478]">
          This preview refreshes every few seconds. Captures here work outside commute mode and save
          to your roll without requiring GPS proximity.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCapture}
            className="rounded-lg bg-[#0b3b8c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Capture this view
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAutoCapture}
            className="rounded-lg border border-[#0b3b8c]/30 px-3 py-2 text-xs font-semibold text-[#0b3b8c] disabled:opacity-40"
          >
            Auto-capture ×{SHOTS_PER_PASS}
          </button>
        </div>
      </div>
    </section>
  );
}
