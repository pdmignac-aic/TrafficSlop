"use client";

import { use, useEffect, useState } from "react";
import FeedView from "@/components/FeedView";

export default function CompanyFeedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [title, setTitle] = useState("Company feed");
  const [resolveErr, setResolveErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setResolveErr(null);
      const r = await fetch(`/api/company/resolve?slug=${encodeURIComponent(slug)}`);
      if (!r.ok) {
        if (!cancelled) setResolveErr("Company not found or you need to join first.");
        return;
      }
      const j = (await r.json()) as { company: { id: string; name: string } };
      if (cancelled) return;
      setCompanyId(j.company.id);
      setTitle(`${j.company.name} — company feed`);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (resolveErr) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-red-700">
        {resolveErr}
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="px-4 py-10 text-center text-sm text-[#5c6478]">
        Resolving company…
      </div>
    );
  }

  return <FeedView scope="company" companyId={companyId} title={title} />;
}
