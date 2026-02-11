import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { BackupsPanel } from "@/components/Settings/Maintenance/BackupsPanel";

export const metadata = {
  title: "Maintenance - LeMedia",
};

export default async function AdminMaintenancePage() {
  const user = await getUser().catch(() => null);
  if (!user?.isAdmin) {
    redirect("/login");
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Maintenance & Recovery</h2>
        <p className="text-sm text-muted">Create, validate, and download backup archives.</p>
      </div>
      <BackupsPanel />
    </section>
  );
}
