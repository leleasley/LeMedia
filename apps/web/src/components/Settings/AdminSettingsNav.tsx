"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ChangeEvent, MouseEvent } from "react";
import { cn } from "@/lib/utils";

type SettingsRoute = {
    id: string;
    label: string;
    href: string;
    match: RegExp;
};

type SettingsGroup = {
    id: string;
    label: string;
    routes: SettingsRoute[];
};

export function AdminSettingsNav() {
    const pathname = usePathname();
    const router = useRouter();
    const mediaServerLabel = "Media Servers";
    const mediaServerRoute = "/admin/settings/media-servers";

    const groups: SettingsGroup[] = [
        {
            id: "system",
            label: "System",
            routes: [
                { id: "general", label: "General", href: "/admin/settings/general", match: /^\/admin\/settings(\/general)?$/ },
                { id: "maintenance", label: "Maintenance", href: "/admin/settings/maintenance", match: /^\/admin\/settings\/maintenance/ },
                { id: "jobs", label: "Jobs", href: "/admin/settings/jobs", match: /^\/admin\/settings\/jobs/ },
                { id: "logs", label: "Logs", href: "/admin/settings/logs", match: /^\/admin\/settings\/logs/ },
            ]
        },
        {
            id: "media",
            label: "Media",
            routes: [
                { id: "media-server", label: mediaServerLabel, href: mediaServerRoute, match: /^\/admin\/settings\/media-servers/ },
                { id: "services", label: "Services", href: "/admin/settings/services", match: /^\/admin\/settings\/services/ },
                { id: "metadata", label: "Metadata", href: "/admin/settings/metadata", match: /^\/admin\/settings\/metadata/ },
                { id: "upgrade-finder", label: "Upgrade Finder", href: "/admin/settings/upgrade-finder", match: /^\/admin\/settings\/upgrade-finder/ },
            ]
        },
        {
            id: "users-auth",
            label: "Users & Auth",
            routes: [
                { id: "users", label: "Users", href: "/admin/settings/users", match: /^\/admin\/settings\/users/ },
                { id: "devices", label: "Devices", href: "/admin/settings/devices", match: /^\/admin\/settings\/devices/ },
                { id: "oidc", label: "OIDC", href: "/admin/settings/oidc", match: /^\/admin\/settings\/oidc/ },
                { id: "third-party", label: "3rd Party Sign-ins", href: "/admin/settings/3rd-party", match: /^\/admin\/settings\/3rd-party/ },
            ]
        },
        {
            id: "requests",
            label: "Requests",
            routes: [
                { id: "approval-rules", label: "Approval Rules", href: "/admin/settings/approval-rules", match: /^\/admin\/settings\/approval-rules/ },
                { id: "shares", label: "Share Links", href: "/admin/settings/shares", match: /^\/admin\/settings\/shares/ },
                { id: "analytics", label: "Analytics", href: "/admin/settings/analytics", match: /^\/admin\/settings\/analytics/ },
            ]
        },
        {
            id: "notifications",
            label: "Notifications",
            routes: [
                { id: "notifications", label: "Global Channels", href: "/admin/settings/notifications", match: /^\/admin\/settings\/notifications(?!\/system-alerts)/ },
                { id: "system-alerts", label: "System Alerts", href: "/admin/settings/notifications/system-alerts", match: /^\/admin\/settings\/notifications\/system-alerts/ },
            ]
        },
        {
            id: "monitoring",
            label: "Monitoring",
            routes: [
                { id: "downloads", label: "Downloads", href: "/admin/settings/downloads", match: /^\/admin\/settings\/downloads/ },
                { id: "storage", label: "Storage", href: "/admin/settings/storage", match: /^\/admin\/settings\/storage/ },
            ]
        },
    ];

    const allRoutes = groups.flatMap(g => g.routes);
    const activeRouteHref = allRoutes.find(route => pathname?.match(route.match))?.href ?? "";

    function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
        event.preventDefault();
        router.push(href);
        router.refresh();
    }

    function handleMobileSelect(event: ChangeEvent<HTMLSelectElement>) {
        const href = event.target.value;
        if (!href || href === activeRouteHref) return;
        router.push(href);
        router.refresh();
    }

    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/65 p-2.5 backdrop-blur-sm sm:p-3">
            <div
                className="pointer-events-none absolute inset-0 opacity-90"
                aria-hidden="true"
                style={{
                    background:
                        "radial-gradient(120% 140% at 0% 0%, rgba(245, 158, 11, 0.14) 0%, rgba(245, 158, 11, 0) 52%), radial-gradient(120% 160% at 100% 0%, rgba(56, 189, 248, 0.12) 0%, rgba(56, 189, 248, 0) 48%)"
                }}
            />

            <div className="relative sm:hidden">
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300/85">Admin sections</p>
                <div className="px-1 pb-1">
                    <label htmlFor="admin-settings-mobile-nav" className="sr-only">Select an admin settings section</label>
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                        <select
                            id="admin-settings-mobile-nav"
                            value={activeRouteHref}
                            onChange={handleMobileSelect}
                            className="w-full appearance-none rounded-xl border-0 bg-transparent px-4 py-3 text-sm font-medium text-slate-100 outline-none"
                            aria-label="Admin settings mobile"
                        >
                            {groups.map(group => (
                                <optgroup key={group.id} label={group.label}>
                                    {group.routes.map(route => (
                                        <option key={route.id} value={route.href}>
                                            {route.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <nav className="relative hidden sm:grid sm:grid-cols-2 xl:grid-cols-3 gap-2" aria-label="Admin settings">
                {groups.map(group => (
                    <section key={group.id} className="rounded-xl border border-white/10 bg-black/25 p-2">
                        <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300/80">{group.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {group.routes.map(route => {
                                const isActive = pathname?.match(route.match);
                                return (
                                    <Link
                                        key={route.id}
                                        href={route.href}
                                        prefetch={false}
                                        onClick={event => navigate(event, route.href)}
                                        className={cn(
                                            "whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                                            isActive
                                                ? "border-amber-300/50 bg-gradient-to-r from-amber-400/25 to-orange-400/15 text-amber-100"
                                                : "border-white/10 bg-white/[0.03] text-slate-200/80 hover:border-white/20 hover:bg-white/[0.07] hover:text-slate-100"
                                        )}
                                        aria-current={isActive ? "page" : undefined}
                                    >
                                        {route.label}
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </nav>
        </div>
    );
}
