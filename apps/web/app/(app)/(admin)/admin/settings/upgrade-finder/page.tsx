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
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-8">
        <div className="text-lg font-bold text-white">Forbidden</div>
        <div className="mt-2 text-sm text-white/50">You&apos;re not in the admin group.</div>
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
      {/* Header Section */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent p-6 md:p-8">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 ring-1 ring-white/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-300">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" x2="12" y1="3" y2="15"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Upgrade Finder</h1>
              <p className="text-sm text-white/60 mt-1">Review your movie library and trigger Radarr searches for better quality releases</p>
            </div>
          </div>
        </div>
      </div>

      <UpgradeFinderClient initialItems={itemsWithHints} />
    </section>
  );
}
