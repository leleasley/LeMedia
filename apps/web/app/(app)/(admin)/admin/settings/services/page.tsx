import { redirect } from "next/navigation";
import { getUser } from "@/auth";

export const metadata = {
  title: "Services Settings - LeMedia",
};
import { listMediaServices } from "@/lib/service-config";
import { ServicesAdminPanel } from "@/components/Settings/Services/ServicesAdminPanel";

export default async function AdminSettingsServicesPage() {
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

    const services = await listMediaServices();

    return (
        <section className="space-y-5">
            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-5 shadow-lg shadow-black/10">
                <h2 className="text-xl font-semibold text-white mb-1">Services</h2>
                <p className="text-sm text-muted">
                    Configure Radarr and Sonarr endpoints for automated media downloads
                </p>
            </div>
            <ServicesAdminPanel initialServices={services} />
        </section>
    );
}
