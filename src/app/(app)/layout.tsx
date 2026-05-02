import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <nav className="sticky top-0 z-50 border-b border-[#0b3b8c]/10 bg-[#faf6ef]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <Link href="/" className="text-sm font-semibold text-[#0b3b8c]">
            Traffic Slop
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/montages"
              className="text-xs font-medium text-[#5c6478] hover:text-[#0b3b8c]"
            >
              Montages
            </Link>
            <Link
              href="/profile"
              className="text-xs font-medium text-[#5c6478] hover:text-[#0b3b8c]"
            >
              Profile
            </Link>
            <Link
              href="/feed"
              className="text-[10px] uppercase tracking-[0.2em] text-[#5c6478]/70 hover:text-[#0b3b8c]/80"
              title="Community — not the main product"
            >
              Community
            </Link>
            <Link
              href="/merch"
              className="text-[10px] uppercase tracking-[0.2em] text-[#5c6478]/70 hover:text-[#0b3b8c]/80"
            >
              Merch
            </Link>
            <SignOutButton />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
