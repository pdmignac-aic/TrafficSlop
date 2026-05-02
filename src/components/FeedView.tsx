"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = {
  id: string;
  score: number;
  published_at: string;
  author: string;
  label: string;
  image_url: string;
  my_vote: number | null;
  entry_at: string | null;
  exit_at: string | null;
};

export default function FeedView({
  scope,
  companyId,
  title,
}: {
  scope: "general" | "company";
  companyId?: string;
  title: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q =
        scope === "general"
          ? "scope=general"
          : `scope=company&company_id=${encodeURIComponent(companyId ?? "")}`;
      const r = await fetch(`/api/feed?${q}`);
      if (!r.ok) throw new Error("feed");
      const j = (await r.json()) as { items: Item[] };
      setItems(j.items ?? []);
    } catch {
      setErr("Could not load feed.");
    } finally {
      setLoading(false);
    }
  }, [scope, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const vote = async (postId: string, value: 1 | -1) => {
    const r = await fetch("/api/feed/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, value }),
    });
    if (r.status === 409) {
      setErr("You already voted on that shot.");
      return;
    }
    if (!r.ok) {
      setErr("Vote failed.");
      return;
    }
    setErr(null);
    void load();
  };

  const scrollTop = () => listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const scrollBottom = () =>
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });

  return (
    <div className="mx-auto flex max-w-lg flex-col px-4 pb-24 pt-6">
      <div className="mb-6">
        <Link href="/" className="text-xs text-[#0b3b8c]">
          ← Back to Traffic Slop
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-[#1a1f2e]">{title}</h1>
        <p className="mt-1 text-xs text-[#5c6478]">
          Sorted by score — top is today&apos;s most-upvoted commute shot, bottom the most-downvoted.
        </p>
      </div>

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={scrollTop}
          className="rounded-lg bg-[#0b3b8c] px-3 py-2 text-xs font-semibold text-white"
        >
          Jump to top
        </button>
        <button
          type="button"
          onClick={scrollBottom}
          className="rounded-lg border border-[#0b3b8c]/30 px-3 py-2 text-xs font-semibold text-[#0b3b8c]"
        >
          Jump to bottom
        </button>
      </div>

      {err ? <p className="mb-2 text-xs text-red-700">{err}</p> : null}

      <div
        ref={listRef}
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto rounded-xl border border-[#1a1f2e]/10 bg-white/60 p-3"
      >
        {loading ? <p className="text-sm text-[#5c6478]">Loading…</p> : null}
        {!loading && items.length === 0 ? (
          <p className="text-sm text-[#5c6478]">No posts yet.</p>
        ) : null}
        {items.map((it) => (
          <article
            key={it.id}
            className="overflow-hidden rounded-xl border border-[#1a1f2e]/8 bg-[#faf6ef] shadow-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.image_url}
              alt=""
              className="w-full bg-[#f0ebe3] object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            <div className="space-y-1 px-3 py-2">
              <p className="text-xs font-semibold text-[#1a1f2e]">{it.label}</p>
              <p className="text-[10px] text-[#5c6478]">
                {it.author} · score {it.score}
              </p>
              {it.entry_at || it.exit_at ? (
                <p className="text-[10px] text-[#5c6478]">
                  {it.entry_at ? `In: ${new Date(it.entry_at).toLocaleString()}` : null}
                  {it.entry_at && it.exit_at ? " · " : null}
                  {it.exit_at ? `Out: ${new Date(it.exit_at).toLocaleString()}` : null}
                </p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={it.my_vote !== null}
                  onClick={() => void vote(it.id, 1)}
                  className="rounded-md bg-[#0b3b8c]/10 px-2 py-1 text-[10px] font-semibold text-[#0b3b8c] disabled:opacity-30"
                >
                  Upvote
                </button>
                <button
                  type="button"
                  disabled={it.my_vote !== null}
                  onClick={() => void vote(it.id, -1)}
                  className="rounded-md bg-[#e63946]/10 px-2 py-1 text-[10px] font-semibold text-[#e63946] disabled:opacity-30"
                >
                  Downvote
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-[#0b3b8c]/10 bg-white/70 p-4 text-xs text-[#5c6478]">
        <p className="font-semibold text-[#0b3b8c]">Company feeds</p>
        <p className="mt-1">
          Create or join a company from the{" "}
          <Link href="/feed/setup" className="text-[#0b3b8c] underline">
            setup page
          </Link>
          , then open <code className="rounded bg-[#f0ebe3] px-1">/feed/company/your-slug</code>.
        </p>
      </div>
    </div>
  );
}
