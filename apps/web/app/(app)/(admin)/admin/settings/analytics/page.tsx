import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { AnalyticsDashboard } from "@/components/Admin/AnalyticsDashboard";

export const metadata = {
  title: "Analytics - Admin Settings",
};

export default async function AnalyticsPage() {
  const user = await getUser();
  
  if (!user?.isAdmin) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Request Analytics</h1>
        <p className="mt-2 text-gray-400">
          View comprehensive analytics about media requests including trends, popular content, user statistics, and request status breakdown.
        </p>
      </div>

      <AnalyticsDashboard />
    </div>
  );
}
