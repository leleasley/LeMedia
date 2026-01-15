import React from "react";
import { NotificationsTabs } from "@/components/Settings/Notifications/NotificationsTabs";

export const metadata = {
    title: "Notifications - Admin Settings"
};

export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <div className="mb-6">
                <h3 className="text-2xl font-semibold text-white">Notification Agents</h3>
                <p className="text-sm text-muted mt-2">
                    Configure and enable notification agents to send alerts for requests and issues.
                </p>
            </div>
            <NotificationsTabs />
            <div className="mt-6">{children}</div>
        </>
    );
}
