"use client";

import Link from "next/link";
import { useState } from "react";
import { buildMontageBlob } from "@/lib/montage";
import type { RollEntry } from "@/lib/roll";

function rangePreset(preset: "week" | "month" | "year") {
  const to = new Date();
  const from = new Date(to);
  if (preset === "week") from.setDate(from.getDate() - 7);
  if (preset === "month") from.setMonth(from.getMonth() - 1);
  if (preset === "year") from.setFullYear(from.getFullYear() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function MontagesPage() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (preset: "week" | "month" | "year") => {
    setBusy(true);
    setStatus("loading…");
    try {
      const { from, to } = rangePreset(preset);
      const r = await fetch(`/api/captures/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!r.ok) throw new Error("range");
      const j = (await r.json()) as {
        items: { id: string; camera_id: string; label: string; captured_at: number; public_url: string }[];
      };
      const entries: RollEntry[] = (j.items ?? []).map((it) => ({
        key: it.id,
        dbId: it.id,
        cameraId: it.camera_id,
        label: it.label,
        capturedAt: it.captured_at,
        imageDataUrl: it.public_url,
      }));
      if (!entries.length) {
        setStatus("No captures in that window.");
        return;
      }
      const blob = await buildMontageBlob(entries.slice(0, 80));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `traffic-slop-${preset}.webm`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      setStatus("saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/" className="text-xs text-[#0b3b8c]">
        ← Home
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-[#1a1f2e]">Montages</h1>
      <p className="mt-2 text-sm text-[#5c6478]">
        Build a 15s vertical reel from captures in your account (same engine as the main “Make my
        montage” button).
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("week")}
          className="rounded-xl bg-[#0b3b8c] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          Last 7 days
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("month")}
          className="rounded-xl border border-[#0b3b8c]/30 px-4 py-3 text-sm font-semibold text-[#0b3b8c] disabled:opacity-40"
        >
          Last 30 days
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("year")}
          className="rounded-xl border border-[#1a1f2e]/15 bg-[#f0ebe3] px-4 py-3 text-sm font-semibold text-[#1a1f2e] disabled:opacity-40"
        >
          Last 365 days
        </button>
      </div>
      {status ? <p className="mt-4 font-mono-caught text-xs text-[#5c6478]">{status}</p> : null}
    </div>
  );
}
