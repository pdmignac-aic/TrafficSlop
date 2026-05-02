"use client";

import Link from "next/link";
import { useState } from "react";

export default function FeedSetupPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [joinSlug, setJoinSlug] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const create = async () => {
    setMsg(null);
    const r = await fetch("/api/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: slug || undefined }),
    });
    const j = (await r.json()) as { error?: string; company?: { slug: string } };
    if (!r.ok) {
      setMsg(j.error ?? "failed");
      return;
    }
    setMsg(`Created — open /feed/company/${j.company?.slug ?? ""}`);
  };

  const join = async () => {
    setMsg(null);
    const r = await fetch("/api/company/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: joinSlug }),
    });
    const j = (await r.json()) as { error?: string; company?: { slug: string } };
    if (!r.ok) {
      setMsg(j.error ?? "failed");
      return;
    }
    setMsg(`Joined — /feed/company/${j.company?.slug ?? ""}`);
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/feed" className="text-xs text-[#0b3b8c]">
        ← Feed
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-[#1a1f2e]">Company setup</h1>
      <p className="mt-2 text-sm text-[#5c6478]">
        Create a private slug for your office, or join with an existing slug.
      </p>

      <section className="mt-8 space-y-3 rounded-xl border border-[#1a1f2e]/10 bg-white/80 p-4">
        <h2 className="text-sm font-semibold text-[#0b3b8c]">Create company</h2>
        <input
          placeholder="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-[#1a1f2e]/15 px-3 py-2 text-sm"
        />
        <input
          placeholder="slug (optional)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full rounded-lg border border-[#1a1f2e]/15 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void create()}
          className="rounded-lg bg-[#0b3b8c] px-4 py-2 text-sm font-semibold text-white"
        >
          Create
        </button>
      </section>

      <section className="mt-6 space-y-3 rounded-xl border border-[#1a1f2e]/10 bg-white/80 p-4">
        <h2 className="text-sm font-semibold text-[#0b3b8c]">Join company</h2>
        <input
          placeholder="company slug"
          value={joinSlug}
          onChange={(e) => setJoinSlug(e.target.value)}
          className="w-full rounded-lg border border-[#1a1f2e]/15 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void join()}
          className="rounded-lg border border-[#0b3b8c]/30 px-4 py-2 text-sm font-semibold text-[#0b3b8c]"
        >
          Join
        </button>
      </section>

      {msg ? <p className="mt-4 text-sm text-[#1a1f2e]">{msg}</p> : null}
    </div>
  );
}
