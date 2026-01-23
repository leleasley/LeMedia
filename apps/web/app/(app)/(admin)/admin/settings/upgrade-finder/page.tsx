import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { listUpgradeFinderItems } from "@/lib/upgrade-finder";
import { listUpgradeFinderHints } from "@/db";
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

  const [items, hints] = await Promise.all([
    listUpgradeFinderItems(),
    listUpgradeFinderHints().catch(() => [])
  ]);

  const hintMap = new Map(
    hints.map(hint => [`${hint.mediaType}:${hint.mediaId}`, hint])
  );

  const itemsWithHints = items.map(item => {
    const hint = hintMap.get(`${item.mediaType}:${item.id}`);
    return {
      ...item,
      hintStatus: hint?.status ?? undefined,
      hintText: hint?.hintText ?? null,
      checkedAt: hint?.checkedAt ?? null,
    };
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Upgrade Finder</h1>
          <p className="text-sm text-white/60 mt-1">Review your movie library and trigger Radarr searches for better quality releases.</p>
        </div>
      </div>

      <UpgradeFinderClient initialItems={itemsWithHints} />
    </section>
  );
}
