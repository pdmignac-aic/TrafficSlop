"use client";

import Image from "next/image";
import { useState } from "react";

const SIZES = ["S", "M", "L", "XL", "2XL"];

export default function MerchPage() {
  const [email, setEmail] = useState("");
  const [size, setSize] = useState("M");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/merch/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, size, notes }),
      });
      const json = (await res.json()) as { error?: string; instructions?: string };
      if (!res.ok) throw new Error(json.error ?? "request failed");
      setMessage(json.instructions ?? 'Venmo PeterMignacca with text "SLOP" to order.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-14 pt-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-[#0b3b8c]/80">
        Merch
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#1a1f2e]">
        Wear the surveillance state.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[#5c6478]">
        White tee. Chest seal. Full back print. Traffic Slop for people who know the city has
        already been watching.
      </p>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#0b3b8c]/15 bg-white shadow-sm">
        <Image
          src="/merch/traffic-slop-tee.png"
          alt="Traffic Slop white tee with chest logo and back print"
          width={1024}
          height={558}
          className="h-auto w-full"
          priority
        />
        <div className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-[#1a1f2e]">Traffic Slop tee</p>
            <p className="mt-1 text-xs leading-relaxed text-[#5c6478]">
              Submit your email and size, then Venmo PeterMignacca with text{" "}
              <span className="font-semibold text-[#0b3b8c]">&quot;SLOP&quot;</span> to order.
            </p>
          </div>

          <label className="block text-xs font-semibold text-[#1a1f2e]">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-xl border border-[#1a1f2e]/15 bg-[#faf6ef] px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block text-xs font-semibold text-[#1a1f2e]">
            Size
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#1a1f2e]/15 bg-[#faf6ef] px-3 py-2.5 text-sm"
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-[#1a1f2e]">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Color requests, pickup notes, etc."
              className="mt-1 min-h-20 w-full rounded-xl border border-[#1a1f2e]/15 bg-[#faf6ef] px-3 py-2.5 text-sm"
            />
          </label>

          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-[#0b3b8c] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#0b3b8c]/20 disabled:opacity-40"
          >
            {busy ? "Submitting…" : "Buy now"}
          </button>

          <div className="rounded-xl border border-[#0b3b8c]/15 bg-[#faf6ef] p-3 text-xs leading-relaxed text-[#5c6478]">
            Payment instruction: Venmo{" "}
            <span className="font-semibold text-[#0b3b8c]">PeterMignacca</span> with text{" "}
            <span className="font-semibold text-[#0b3b8c]">&quot;SLOP&quot;</span> to order.
          </div>

          {message ? <p className="text-sm font-semibold text-[#0b3b8c]">{message}</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
