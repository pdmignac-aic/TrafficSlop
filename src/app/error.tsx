"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#faf6ef] px-6 text-center text-[#1a1f2e]">
      <h1 className="text-lg font-semibold text-[#0b3b8c]">Something broke</h1>
      <p className="max-w-md text-sm text-[#5c6478]">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-[#0b3b8c] px-5 py-2.5 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
