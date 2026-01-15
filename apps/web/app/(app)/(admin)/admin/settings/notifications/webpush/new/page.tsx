import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import NotificationsWebPush from "@/components/Settings/Notifications/NotificationsWebPush";

export const metadata = {
    title: "New Web Push Notification - Admin Settings",
};

export default async function NewWebPushNotificationPage() {
    const user = await getUser().catch(() => null);
    if (!user) redirect("/login");
    if (!user.isAdmin) {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-8">
                <div className="text-lg font-bold">Forbidden</div>
                <div className="mt-2 text-sm opacity-75">You&apos;re not in the admin group.</div>
            </div>
        );
    }

    return <NotificationsWebPush mode="create" />;
}
