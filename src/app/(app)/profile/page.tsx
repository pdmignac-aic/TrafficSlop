"use client";

import { useEffect, useMemo, useState } from "react";
import { loadRoll, type RollEntry } from "@/lib/roll";

type ProfilePhoto = RollEntry & {
  source: "cloud" | "local";
};

export default function ProfilePage() {
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [selected, setSelected] = useState<ProfilePhoto | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      const local: ProfilePhoto[] = loadRoll().map((p) => ({ ...p, source: p.dbId ? "cloud" : "local" }));
      try {
        const res = await fetch("/api/roll", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setPhotos(local);
          return;
        }
        const json = (await res.json()) as {
          items: {
            id: string;
            camera_id: string;
            label: string;
            captured_at: number;
            public_url: string;
          }[];
        };
        const cloud: ProfilePhoto[] = (json.items ?? []).map((it) => ({
          key: it.id,
          dbId: it.id,
          cameraId: it.camera_id,
          label: it.label,
          capturedAt: it.captured_at,
          imageDataUrl: it.public_url,
          source: "cloud",
        }));
        const seen = new Set(cloud.map((p) => p.dbId ?? p.key));
        const merged = [...cloud, ...local.filter((p) => !seen.has(p.dbId ?? p.key))].sort(
          (a, b) => b.capturedAt - a.capturedAt,
        );
        if (!cancelled) setPhotos(merged);
      } catch {
        if (!cancelled) setPhotos(local);
      }
    }

    void loadPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  const cloudCount = useMemo(() => photos.filter((p) => p.source === "cloud").length, [photos]);

  const publishSelected = async () => {
    if (!selected?.dbId) {
      setStatus("This photo is local-only. Capture again after Storage is configured to publish.");
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/feed/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capture_id: selected.dbId,
          visibility: "general",
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "publish failed");
      setStatus("Published to the general feed.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  };

  const syncSelectedToCloud = async () => {
    if (!selected || selected.dbId) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/captures/from-data-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_url: selected.imageDataUrl,
          camera_id: selected.cameraId,
          label: selected.label,
          captured_at: selected.capturedAt,
        }),
      });
      const json = (await res.json()) as {
        id?: string;
        public_url?: string;
        captured_at?: number;
        error?: string;
      };
      if (!res.ok || !json.id || !json.public_url) throw new Error(json.error ?? "sync failed");

      const updated: ProfilePhoto = {
        ...selected,
        key: json.id,
        dbId: json.id,
        imageDataUrl: json.public_url,
        capturedAt: json.captured_at ?? selected.capturedAt,
        source: "cloud",
      };
      setSelected(updated);
      setPhotos((prev) =>
        [updated, ...prev.filter((p) => p.key !== selected.key)].sort((a, b) => b.capturedAt - a.capturedAt),
      );
      setStatus("Synced to cloud. You can publish it now.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Cloud sync failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-[#0b3b8c]/80">
        Profile
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#1a1f2e]">
        Your saved slop.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[#5c6478]">
        Every manual, selected-camera, and commute capture appears here. Cloud-saved photos can be
        published to the feed.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#1a1f2e]/10 bg-white p-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#5c6478]">Total</p>
          <p className="mt-1 text-2xl font-semibold text-[#1a1f2e]">{photos.length}</p>
        </div>
        <div className="rounded-xl border border-[#1a1f2e]/10 bg-white p-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#5c6478]">Cloud saved</p>
          <p className="mt-1 text-2xl font-semibold text-[#0b3b8c]">{cloudCount}</p>
        </div>
      </div>

      {status ? <p className="mt-4 text-sm text-[#0b3b8c]">{status}</p> : null}

      <section className="mt-8">
        <div className="grid grid-cols-2 gap-4">
          {photos.map((photo) => (
            <button
              key={photo.key}
              type="button"
              onClick={() => {
                setSelected(photo);
                setStatus("");
              }}
              className="overflow-hidden rounded-xl border border-[#1a1f2e]/8 bg-white text-left shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.imageDataUrl}
                alt=""
                className="w-full bg-[#f0ebe3] object-contain"
                style={{ imageRendering: "pixelated" }}
              />
              <span className="block border-t border-[#1a1f2e]/6 px-2 py-2 font-mono-caught text-[10px] leading-snug text-[#5c6478]">
                {new Date(photo.capturedAt).toLocaleString()}
                <br />
                <span className="text-[#1a1f2e]">{photo.label}</span>
                <br />
                <span className={photo.source === "cloud" ? "text-[#0b3b8c]" : "text-[#a36b00]"}>
                  {photo.source === "cloud" ? "cloud saved" : "local only"}
                </span>
              </span>
            </button>
          ))}
        </div>
        {photos.length === 0 ? (
          <p className="rounded-xl border border-[#1a1f2e]/10 bg-white/70 p-4 text-sm text-[#5c6478]">
            No photos yet. Capture a camera view or begin a commute.
          </p>
        ) : null}
      </section>

      {selected ? (
        <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#faf6ef] p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#0b3b8c]">{selected.label}</h2>
                <p className="font-mono-caught mt-1 text-[10px] text-[#5c6478]">
                  {new Date(selected.capturedAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full border border-[#1a1f2e]/10 px-2 py-1 text-[10px] font-semibold text-[#5c6478]"
              >
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.imageDataUrl}
              alt=""
              className="w-full rounded-xl bg-[#f0ebe3] object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            <div className="mt-4 flex gap-2">
              {selected.dbId ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void publishSelected()}
                  className="flex-1 rounded-xl bg-[#0b3b8c] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Send to feed
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void syncSelectedToCloud()}
                  className="flex-1 rounded-xl bg-[#0b3b8c] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Sync to cloud
                </button>
              )}
              <a
                href={selected.imageDataUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-[#0b3b8c]/30 px-4 py-3 text-sm font-semibold text-[#0b3b8c]"
              >
                Open
              </a>
            </div>
            {!selected.dbId ? (
              <p className="mt-3 text-xs leading-relaxed text-[#a36b00]">
                This one is local-only. Sync it to cloud first, then you can send it to the feed.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
