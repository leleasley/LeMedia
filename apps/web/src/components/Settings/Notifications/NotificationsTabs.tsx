"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { Cloud, LayoutGrid, Link2, Mail, ShieldAlert } from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { cn } from "@/lib/utils";
import { ADMIN_NOTIFICATION_PROVIDERS } from "@/lib/notification-providers";

function ProviderIcon({
    provider,
    className = "h-4 w-4",
}: {
    provider: (typeof ADMIN_NOTIFICATION_PROVIDERS)[number];
    className?: string;
}) {
    if (provider.iconKind === "image" && provider.iconPath) {
        return (
            <Image
                src={provider.iconPath}
                alt={provider.iconAlt}
                width={16}
                height={16}
                className={`${className} brightness-0 invert`}
            />
        );
    }

    if (provider.iconKind === "mail") {
        return <Mail className={className} strokeWidth={1.9} />;
    }

    if (provider.iconKind === "webpush") {
        return <Cloud className={className} strokeWidth={1.9} />;
    }

    return <Link2 className={className} strokeWidth={1.9} />;
}

export function NotificationsTabs() {
    const pathname = usePathname();
    const isOverview = pathname === "/admin/settings/notifications";
    const isSystemAlerts = pathname?.startsWith("/admin/settings/notifications/system-alerts");

    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/65 p-2.5 backdrop-blur-sm">
            <div
                className="pointer-events-none absolute inset-0 opacity-90"
                aria-hidden="true"
                style={{
                    background:
                        "radial-gradient(120% 140% at 0% 0%, rgba(245, 158, 11, 0.14) 0%, rgba(245, 158, 11, 0) 52%), radial-gradient(120% 160% at 100% 0%, rgba(56, 189, 248, 0.08) 0%, rgba(56, 189, 248, 0) 48%)"
                }}
            />
            <div role="tablist" aria-label="Global channels and system alerts" className="space-y-2">
                <div className="grid gap-2 md:grid-cols-2">
                    <PrefetchLink
                        href="/admin/settings/notifications"
                        className={cn(
                            "relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                            isOverview
                                ? "border-amber-300/45 bg-amber-400/20 text-amber-100"
                                : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]"
                        )}
                        aria-current={isOverview ? "page" : undefined}
                    >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/25">
                            <LayoutGrid className="h-3.5 w-3.5" />
                        </span>
                        <span>
                            <span className="block text-sm font-semibold">Global Channels</span>
                            <span className="block text-xs text-slate-400">Shared delivery endpoints used across the app.</span>
                        </span>
                    </PrefetchLink>

                    <PrefetchLink
                        href="/admin/settings/notifications/system-alerts"
                        className={cn(
                            "relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                            isSystemAlerts
                                ? "border-amber-300/45 bg-amber-400/20 text-amber-100"
                                : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]"
                        )}
                        aria-current={isSystemAlerts ? "page" : undefined}
                    >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/25">
                            <ShieldAlert className="h-3.5 w-3.5" />
                        </span>
                        <span>
                            <span className="block text-sm font-semibold">System Alerts</span>
                            <span className="block text-xs text-slate-400">Health rules, recipients, and outage routing.</span>
                        </span>
                    </PrefetchLink>
                </div>

                <div className="relative rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">Global Channel Providers</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                        {ADMIN_NOTIFICATION_PROVIDERS.map((provider) => {
                            const isActive = pathname?.startsWith(provider.adminPath);

                            return (
                                <PrefetchLink
                                    key={provider.type}
                                    href={provider.adminPath}
                                    className={cn(
                                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors",
                                        isActive
                                            ? "border-amber-300/45 bg-amber-400/20 text-amber-100"
                                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white"
                                    )}
                                    aria-current={isActive ? "page" : undefined}
                                >
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/25">
                                        <ProviderIcon provider={provider} />
                                    </span>
                                    <span className="truncate">{provider.label}</span>
                                </PrefetchLink>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
