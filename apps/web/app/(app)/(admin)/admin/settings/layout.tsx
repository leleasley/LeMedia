import React from "react";
import { AdminSettingsNav } from "@/components/Settings/AdminSettingsNav";

export const metadata = {
    title: "Admin Settings"
};

export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-3 md:px-8 pb-6 md:pb-10">
            <div className="space-y-6">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted">Admin</p>
                    <h1 className="mt-3 text-3xl font-semibold text-white">Settings</h1>
                    <p className="mt-2 max-w-3xl text-sm text-muted">
                        Configure core behavior, identity, and service integrations to match your media workflow.
                    </p>
                </div>
                <AdminSettingsNav />
                <div className="space-y-8">{children}</div>
            </div>
        </div>
    );
}
