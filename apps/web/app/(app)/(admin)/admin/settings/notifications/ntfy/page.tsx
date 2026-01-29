import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import NotificationList from "@/components/Settings/Notifications/NotificationList";

export const metadata = {
    title: "Ntfy Notifications - Admin Settings",
};

export default async function NtfyNotificationsPage() {
    const user = await getUser().catch(() => null);
    if (!user) redirect("/login");
    if (!user.isAdmin) {
        return (
            <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-8">
                <div className="text-lg font-bold text-white">Forbidden</div>
                <div className="mt-2 text-sm text-white/50">You&apos;re not in the admin group.</div>
            </div>
        );
    }

    return <NotificationList type="ntfy" typeName="Ntfy" />;
}
