import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import NotificationsDiscord from "@/components/Settings/Notifications/NotificationsDiscord";

export const metadata = {
    title: "New Discord Notification - Admin Settings",
};

export default async function NewDiscordNotificationPage() {
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

    return <NotificationsDiscord mode="create" />;
}
