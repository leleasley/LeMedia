import React from "react";
import { AdminSettingsNav } from "@/components/Settings/AdminSettingsNav";

export const metadata = {
    title: "Admin Settings"
};

export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-3 md:px-8 pb-6 md:pb-10">
            <div className="space-y-6">
                <AdminSettingsNav />
                <div>{children}</div>
            </div>
        </div>
    );
}
