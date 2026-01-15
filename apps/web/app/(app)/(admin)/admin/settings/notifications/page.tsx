import { redirect } from "next/navigation";

export default function AdminSettingsNotificationsPage() {
    // Redirect to email as the default tab
    redirect("/admin/settings/notifications/email");
}
