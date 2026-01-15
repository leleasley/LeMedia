import { redirect } from "next/navigation";
import { getUser } from "@/auth";

export const metadata = {
  title: "Jellyfin Settings - LeMedia",
};
import { JellyfinSettingsPanel } from "@/components/Settings/Jellyfin/JellyfinSettingsPanel";

export default async function AdminSettingsJellyfinPage() {
    const user = await getUser().catch(() => null);
    if (!user) {
        redirect("/login");
    }
    if (!user.isAdmin) {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-8 shadow-lg shadow-black/10">
                <div className="text-lg font-bold">Forbidden</div>
                <div className="mt-2 text-sm opacity-75">You&apos;re not in the admin group.</div>
            </div>
        );
    }

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold text-white">Jellyfin</h2>
                <p className="text-sm text-muted">
                    Configure the Jellyfin connection, API key, and library visibility settings.
                </p>
            </div>
            <JellyfinSettingsPanel />
        </section>
    );
}
