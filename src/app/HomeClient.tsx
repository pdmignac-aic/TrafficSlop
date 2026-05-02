"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const CaughtApp = dynamic(() => import("@/components/CaughtApp"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-[#0b3b8c]">Loading Caught…</p>
      <p className="text-xs text-[#5c6478]">If this never finishes, open the browser console for errors.</p>
    </div>
  ),
});

export default function HomeClient() {
  return (
    <main className="min-h-dvh bg-[#faf6ef] text-[#1a1f2e]">
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-[#5c6478]">
            Loading…
          </div>
        }
      >
        <CaughtApp />
      </Suspense>
    </main>
  );
}
