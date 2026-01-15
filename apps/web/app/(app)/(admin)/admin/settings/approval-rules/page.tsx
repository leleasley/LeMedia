import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { ApprovalRulesPanel } from "@/components/Admin/ApprovalRulesPanel";

export const metadata = {
  title: "Approval Rules - Admin Settings",
};

export default async function ApprovalRulesPage() {
  const user = await getUser();
  
  if (!user?.isAdmin) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Auto-Approval Rules</h1>
        <p className="mt-2 text-gray-400">
          Configure automatic approval rules for media requests based on user trust level, popularity, time, genre, and content rating.
        </p>
      </div>

      <ApprovalRulesPanel />
    </div>
  );
}
