"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
                { id: "notifications", label: "Notifications", href: "/admin/settings/notifications", match: /^\/admin\/settings\/notifications(?!\/system-alerts)/ },
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
    const selectedRoute = allRoutes.find(route => pathname?.match(route.match))?.href ?? allRoutes[0]?.href;

    return (
        <>
            {/* Mobile dropdown */}
            <div className="sm:hidden">
                <select
                    id="admin-settings-tabs"
                    value={selectedRoute}
                    onChange={event => router.push(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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

            {/* Desktop: single compact inline nav */}
            <nav className="hidden sm:flex flex-wrap items-center gap-x-1 gap-y-1 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2" aria-label="Admin settings">
                {groups.map((group, groupIndex) => (
                    <div key={group.id} className="contents">
                        {groupIndex > 0 && (
                            <span className="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />
                        )}
                        {group.routes.map(route => {
                            const isActive = pathname?.match(route.match);
                            return (
                                <Link
                                    key={route.id}
                                    href={route.href}
                                    prefetch={false}
                                    onClick={event => {
                                        event.preventDefault();
                                        router.push(route.href);
                                        router.refresh();
                                    }}
                                    className={cn(
                                        "rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                                        isActive
                                            ? "bg-amber-500/20 text-amber-200"
                                            : "text-white/55 hover:bg-white/5 hover:text-white/90"
                                    )}
                                    aria-current={isActive ? "page" : undefined}
                                >
                                    {route.label}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </>
    );
}
