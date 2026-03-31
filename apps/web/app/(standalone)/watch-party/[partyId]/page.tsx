import { redirect } from "next/navigation";
import Link from "next/link";
import { Home } from "lucide-react";
import { getUser } from "@/auth";
import { WatchPartyRoomClient } from "@/components/WatchParty/WatchPartyRoomClient";
import { getPartyWithContext, resolveWatchPartyId } from "@/db/watch-party";

export const metadata = {
  title: "Watch Party - LeMedia",
};

export default async function WatchPartyPage({
  params,
}: {
  params: Promise<{ partyId: string }> | { partyId: string };
}) {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const resolved = await Promise.resolve(params);
  const partyId = String(resolved.partyId || "").trim();
  if (!partyId) {
    redirect("/forbidden");
  }

  const resolvedId = await resolveWatchPartyId(partyId);
  if (resolvedId) {
    const context = await getPartyWithContext(resolvedId, user.id).catch(() => null);
    if (!context?.participant) {
      return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(99,102,241,0.12),transparent_40%),radial-gradient(circle_at_78%_82%,rgba(239,68,68,0.10),transparent_45%),linear-gradient(145deg,rgba(15,23,42,0.95),rgba(17,24,39,0.98))]" />
          <div className="relative z-10 glass-strong w-full max-w-lg rounded-2xl border border-white/10 p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="mx-auto mb-7 w-fit">
              <div className="relative mx-auto h-36 w-52">
                <div className="absolute inset-0 rounded-2xl border-2 border-slate-300/40 bg-slate-700/30 shadow-[0_0_35px_rgba(15,23,42,0.7)]" />
                <div className="absolute inset-3 overflow-hidden rounded-lg border border-slate-400/20 bg-slate-950">
                  <div className="absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.18),rgba(255,255,255,0.18)_2px,transparent_2px,transparent_6px)]" />
                  <div className="absolute inset-0 bg-gradient-to-b from-red-400/10 via-white/5 to-red-400/10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="select-none text-lg font-black tracking-[0.3em] text-red-200/85">NO ACCESS</span>
                  </div>
                </div>
                <div className="absolute -bottom-2 left-7 h-3 w-14 -rotate-6 rounded-full bg-slate-500/70" />
                <div className="absolute -bottom-2 right-7 h-3 w-14 rotate-6 rounded-full bg-slate-500/70" />
                <div className="absolute -right-2 top-14 h-10 w-2 rounded bg-slate-400/60" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white">Not on the Guest List</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-gray-400">
              This watch party is invite-only. Ask the host to send you an invite to join.
            </p>
            <div className="mt-7">
              <Link href="/" className="btn btn-primary gap-2 px-7 py-3 text-sm">
                <Home className="h-4 w-4" />
                Back Home
              </Link>
            </div>
          </div>
        </main>
      );
    }
  }

  return <WatchPartyRoomClient partyId={partyId} />;
}
