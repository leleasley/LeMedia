import { redirect } from "next/navigation";
import { getUser } from "@/auth";

export const metadata = {
  title: "OIDC Settings - LeMedia",
};
import { OidcSettingsPanel } from "@/components/Settings/Oidc/OidcSettingsPanel";

export default async function AdminSettingsOidcPage() {
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
                <h2 className="text-2xl font-semibold text-white">OIDC</h2>
                <p className="text-sm text-muted">
                    Configure Pocket ID so users can sign in with passkeys and SSO.
                </p>
            </div>
            <OidcSettingsPanel />
        </section>
    );
}
