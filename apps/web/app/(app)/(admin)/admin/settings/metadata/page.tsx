import { redirect } from "next/navigation";
import { getUser } from "@/auth";

export const metadata = {
  title: "Metadata Settings - LeMedia",
};
import { MetadataSettingsPanel } from "@/components/Settings/Metadata/MetadataSettingsPanel";

export default async function AdminSettingsMetadataPage() {
    const user = await getUser().catch(() => null);
    if (!user) {
        redirect("/login");
    }
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
            {/* Header Section */}
            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-teal-500/5 to-transparent p-6 md:p-8">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                <div className="relative">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 ring-1 ring-white/10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-300">
                                <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/>
                                <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                                <path d="m3 15 2 2 4-4"/>
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-white">Metadata</h1>
                            <p className="text-sm text-white/60 mt-1">Define how metadata and imagery are sourced across the experience</p>
                        </div>
                    </div>
                </div>
            </div>
            <MetadataSettingsPanel />
        </section>
    );
}
