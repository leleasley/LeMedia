"use client";

import { usePathname } from "next/navigation";
import { BellRing, ShieldAlert } from "lucide-react";

export function NotificationsHeader() {
    const pathname = usePathname();
    const isSystemAlertsPage = pathname?.startsWith("/admin/settings/notifications/system-alerts");
    const HeaderIcon = isSystemAlertsPage ? ShieldAlert : BellRing;

    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-4 md:p-6">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
            <div className="relative">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-white/10">
                        <HeaderIcon className="h-6 w-6 text-amber-300" />
                    </div>
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
                            Admin Notifications
                        </div>
                        <h1 className="mt-2 text-2xl font-bold text-white md:text-3xl">
                            {isSystemAlertsPage ? "System Alerts" : "Global Channels"}
                        </h1>
                        <p className="mt-1 max-w-3xl text-sm text-white/70">
                            {isSystemAlertsPage
                                ? "Route health, latency, and outage events through the global delivery channels you trust."
                                : "Configure the shared delivery endpoints used for request updates, issues, releases, and routed system alerts."}
                        </p>
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Surface</div>
                        <div className="mt-1 font-semibold text-white">{isSystemAlertsPage ? "Routing rules" : "Shared endpoints"}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Audience</div>
                        <div className="mt-1 font-semibold text-white">Admin-managed only</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Use</div>
                        <div className="mt-1 font-semibold text-white">Global channels + alert policy</div>
                    </div>
                </div>
            </div>
        </div>
    );
}