import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { JobsListClient } from "@/components/Settings/Jobs/JobsListClient";

export const metadata = {
  title: "Jobs - LeMedia",
};

export default async function AdminJobsPage() {
  const user = await getUser().catch(() => null);
  if (!user?.isAdmin) {
    redirect("/login");
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Jobs & Scheduling</h2>
        <p className="text-sm text-muted">Manage background tasks, schedules, and runtime health metrics.</p>
      </div>

      <JobsListClient />
    </section>
  );
}
