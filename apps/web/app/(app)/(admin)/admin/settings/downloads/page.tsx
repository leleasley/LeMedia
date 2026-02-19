import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { DownloadsDashboard } from "@/components/Settings/Downloads/DownloadsDashboard";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

export const metadata = {
    title: "Downloads - LeMedia",
};

export default async function AdminSettingsDownloadsPage() {
    const user = await getUser().catch(() => null);
    if (!user) redirect("/login");
    if (!user.isAdmin) {
        return (
            <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-8">
                <div className="text-lg font-bold text-white">Forbidden</div>
                <div className="mt-2 text-sm text-white/50">You&apos;re not in the admin group.</div>
            </div>
        );
    }

    return (
        <section className="space-y-6">
            {/* Page header */}
            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent p-6 md:p-8">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                <div className="relative">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ring-1 ring-white/10">
                            <ArrowDownTrayIcon className="w-7 h-7 text-blue-300" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-white">Downloads</h1>
                            <p className="text-sm text-white/60 mt-1">
                                Live download queue across all configured services — Radarr, Sonarr, qBittorrent, SABnzbd, and nzbget
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <DownloadsDashboard />
        </section>
    );
}
