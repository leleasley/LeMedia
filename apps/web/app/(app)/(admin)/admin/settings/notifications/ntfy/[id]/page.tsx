import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import NotificationsNtfy from "@/components/Settings/Notifications/NotificationsNtfy";

export const metadata = {
    title: "Edit Ntfy Notification - Admin Settings",
};

export default async function EditNtfyNotificationPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
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

    const { id } = await params;
    return <NotificationsNtfy mode="edit" endpointId={parseInt(id)} />;
}
