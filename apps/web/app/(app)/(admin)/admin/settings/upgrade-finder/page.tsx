import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { listUpgradeFinderItems } from "@/lib/upgrade-finder";
import { UpgradeFinderClient } from "@/components/Admin/UpgradeFinderClient";

export const metadata = {
  title: "Upgrade Finder - LeMedia",
};

export default async function UpgradeFinderPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  if (!user.isAdmin) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-8 shadow-lg shadow-black/10">
        <div className="text-lg font-bold text-white">Forbidden</div>
        <div className="mt-2 text-sm text-white/75">You&apos;re not in the admin group.</div>
      </div>
    );
  }

  const items = await listUpgradeFinderItems();

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Upgrade Finder</h1>
          <p className="text-sm text-white/60 mt-1">Review your library and trigger Radarr/Sonarr searches for better releases.</p>
        </div>
      </div>

      <UpgradeFinderClient initialItems={items} />
    </section>
  );
}
