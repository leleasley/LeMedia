import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { AdminDevicesPageClient } from "@/components/Settings/Devices/AdminDevicesPageClient";

export const metadata = {
  title: "Devices - LeMedia",
};

export default async function AdminDevicesPage() {
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

  return <AdminDevicesPageClient />;
}
