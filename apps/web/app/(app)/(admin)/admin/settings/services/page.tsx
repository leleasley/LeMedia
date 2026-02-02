import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { listMediaServices } from "@/lib/service-config";
import { ServicesAdminPanel } from "@/components/Settings/Services/ServicesAdminPanel";

export const metadata = {
  title: "Services - LeMedia",
};

export default async function AdminSettingsServicesPage() {
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

  const services = await listMediaServices();

  return (
    <section className="space-y-6">
      {/* Header Section */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-6 md:p-8">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-white/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Services</h1>
              <p className="text-sm text-white/60 mt-1">Configure Radarr, Sonarr, Prowlarr, and download clients for automated media workflows</p>
            </div>
          </div>
        </div>
      </div>
      <ServicesAdminPanel initialServices={services} />
    </section>
  );
}
