"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const origin = window.location.origin;
      const { error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: { display_name: displayName || email.split("@")[0] },
        },
      });
      if (signErr) throw signErr;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-[#1a1f2e]">Create account</h1>
      <p className="mb-8 text-sm text-[#5c6478]">Save captures, email commutes, optional community feed.</p>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <label className="block text-sm font-medium text-[#1a1f2e]">
          Display name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#1a1f2e]/15 bg-white px-3 py-2.5 text-sm"
            placeholder="How you appear on feeds"
          />
        </label>
        <label className="block text-sm font-medium text-[#1a1f2e]">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#1a1f2e]/15 bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-[#1a1f2e]">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#1a1f2e]/15 bg-white px-3 py-2.5 text-sm"
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[#0b3b8c] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[#5c6478]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[#0b3b8c]">
          Sign in
        </Link>
      </p>
    </div>
  );
}
