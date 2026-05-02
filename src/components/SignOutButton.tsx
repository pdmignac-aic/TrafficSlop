"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const supabase = createBrowserSupabase();
        await supabase.auth.signOut();
      }
    } catch {
      /* ignore */
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="text-xs text-[#5c6478] underline decoration-[#5c6478]/40 underline-offset-2 hover:text-[#1a1f2e]"
    >
      Sign out
    </button>
  );
}
