import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { Clapperboard } from "lucide-react";
import { AdminWatchPartiesPanel } from "@/components/Settings/WatchParties/AdminWatchPartiesPanel";

export const metadata = {
  title: "Watch Parties - LeMedia",
};

export default async function AdminSettingsWatchPartiesPage() {
  const user = await getUser().catch(() => null);
  if (!user) redirect("/login");

  if (!user.isAdmin) {
    return (
      <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 p-8 shadow-2xl">
        <div className="text-lg font-bold text-white">Forbidden</div>
        <div className="mt-2 text-sm text-white/50">You&apos;re not in the admin group.</div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-6 md:rounded-3xl md:p-8">
        <div className="relative">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-white/10">
              <Clapperboard className="h-7 w-7 text-amber-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white md:text-3xl">Watch Parties</h1>
              <p className="mt-1 text-sm text-white/60">
                Admin visibility into hosts, participant load, status, and chat activity.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AdminWatchPartiesPanel />
    </section>
  );
}
