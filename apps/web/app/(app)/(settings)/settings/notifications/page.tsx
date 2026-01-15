import { getUser } from "@/auth";
import { redirect } from "next/navigation";
import { NotificationsSettingsPage } from "@/components/Settings/NotificationsPage";

export default async function NotificationsPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  return <NotificationsSettingsPage />;
}
