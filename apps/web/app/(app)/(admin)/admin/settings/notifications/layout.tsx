import React from "react";
import { NotificationsTabs } from "@/components/Settings/Notifications/NotificationsTabs";
import { NotificationsHeader } from "@/components/Settings/Notifications/NotificationsHeader";

export const metadata = {
    title: "Notifications - Admin Settings"
};

export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
    return (
        <section className="space-y-6">
            <NotificationsHeader />
            <NotificationsTabs />
            <div>{children}</div>
        </section>
    );
}
