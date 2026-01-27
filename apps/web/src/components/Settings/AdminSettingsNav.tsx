"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
    Cog6ToothIcon,
    UserGroupIcon,
    BellIcon,
    ServerIcon,
    KeyIcon,
    RectangleStackIcon,
    FilmIcon,
    ArrowUpCircleIcon,
    ClipboardDocumentListIcon,
    DocumentTextIcon,
    ChartBarIcon,
    ShieldCheckIcon,
    ClockIcon,
    ShareIcon,
    ChevronDownIcon,
    ComputerDesktopIcon
} from "@heroicons/react/24/outline";

type SettingsRoute = {
    id: string;
    label: string;
    href: string;
    match: RegExp;
    icon: React.ComponentType<{ className?: string }>;
};

type SettingsGroup = {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    routes: SettingsRoute[];
};

export function AdminSettingsNav() {
    const pathname = usePathname();
    const router = useRouter();
    const mediaServerLabel = "Jellyfin";
    const mediaServerRoute = "/admin/settings/jellyfin";

    const groups: SettingsGroup[] = [
        {
            id: "system",
            label: "System",
            icon: Cog6ToothIcon,
            routes: [
                { id: "general", label: "General", href: "/admin/settings/general", match: /^\/admin\/settings(\/general)?$/, icon: Cog6ToothIcon },
                { id: "jobs", label: "Jobs", href: "/admin/settings/jobs", match: /^\/admin\/settings\/jobs/, icon: ClockIcon },
                { id: "logs", label: "Logs", href: "/admin/settings/logs", match: /^\/admin\/settings\/logs/, icon: DocumentTextIcon },
            ]
        },
        {
            id: "media",
            label: "Media",
            icon: FilmIcon,
            routes: [
                { id: "media-server", label: mediaServerLabel, href: mediaServerRoute, match: /^\/admin\/settings\/jellyfin/, icon: ServerIcon },
                { id: "services", label: "Services", href: "/admin/settings/services", match: /^\/admin\/settings\/services/, icon: RectangleStackIcon },
                { id: "metadata", label: "Metadata", href: "/admin/settings/metadata", match: /^\/admin\/settings\/metadata/, icon: FilmIcon },
                { id: "upgrade-finder", label: "Upgrade Finder", href: "/admin/settings/upgrade-finder", match: /^\/admin\/settings\/upgrade-finder/, icon: ArrowUpCircleIcon },
            ]
        },
        {
            id: "users-auth",
            label: "Users & Auth",
            icon: UserGroupIcon,
            routes: [
                { id: "users", label: "Users", href: "/admin/settings/users", match: /^\/admin\/settings\/users/, icon: UserGroupIcon },
                { id: "devices", label: "Devices", href: "/admin/settings/devices", match: /^\/admin\/settings\/devices/, icon: ComputerDesktopIcon },
                { id: "oidc", label: "OIDC", href: "/admin/settings/oidc", match: /^\/admin\/settings\/oidc/, icon: KeyIcon },
            ]
        },
        {
            id: "requests",
            label: "Requests",
            icon: ClipboardDocumentListIcon,
            routes: [
                { id: "requests", label: "Requests", href: "/admin/settings/requests", match: /^\/admin\/settings\/requests/, icon: ClipboardDocumentListIcon },
                { id: "approval-rules", label: "Approval Rules", href: "/admin/settings/approval-rules", match: /^\/admin\/settings\/approval-rules/, icon: ShieldCheckIcon },
                { id: "shares", label: "Share Links", href: "/admin/settings/shares", match: /^\/admin\/settings\/shares/, icon: ShareIcon },
                { id: "analytics", label: "Analytics", href: "/admin/settings/analytics", match: /^\/admin\/settings\/analytics/, icon: ChartBarIcon },
            ]
        },
        {
            id: "notifications",
            label: "Notifications",
            icon: BellIcon,
            routes: [
                { id: "notifications", label: "Notifications", href: "/admin/settings/notifications", match: /^\/admin\/settings\/notifications/, icon: BellIcon },
            ]
        },
    ];

    const allRoutes = groups.flatMap(g => g.routes);
    const selectedRoute = allRoutes.find(route => pathname?.match(route.match))?.href ?? allRoutes[0]?.href;

    const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
        const activeGroup = groups.find(g => g.routes.some(r => pathname?.match(r.match)));
        return new Set(activeGroup ? [activeGroup.id] : ["system"]);
    });

    const toggleGroup = (groupId: string) => {
        setOpenGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    };

    return (
        <div className="space-y-4">
            {/* Mobile dropdown */}
            <div className="sm:hidden">
                <label htmlFor="admin-settings-tabs" className="sr-only">
                    Select a tab
                </label>
                <select
                    id="admin-settings-tabs"
                    value={selectedRoute}
                    onChange={event => router.push(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
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

            {/* Desktop grouped tabs */}
            <div className="hidden sm:block">
                <div className="space-y-4">
                    {groups.map(group => {
                        const isOpen = openGroups.has(group.id);
                        const hasActiveRoute = group.routes.some(r => pathname?.match(r.match));
                        const Icon = group.icon;

                        return (
                            <div key={group.id} className="rounded-lg border border-white/10 bg-slate-900/40">
                                <button
                                    onClick={() => toggleGroup(group.id)}
                                    className={cn(
                                        "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
                                        hasActiveRoute ? "text-indigo-400" : "text-white hover:bg-slate-800/50"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon className="h-5 w-5" />
                                        <span className="font-medium">{group.label}</span>
                                    </div>
                                    <ChevronDownIcon
                                        className={cn(
                                            "h-4 w-4 transition-transform",
                                            isOpen ? "rotate-180" : ""
                                        )}
                                    />
                                </button>
                                {isOpen && (
                                    <div className="border-t border-white/10 px-4 py-2">
                                        <nav className="flex flex-wrap gap-4" aria-label={`${group.label} settings`}>
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
                                                            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                                                            isActive
                                                                ? "bg-indigo-500/10 text-indigo-400"
                                                                : "text-muted hover:bg-slate-800 hover:text-white"
                                                        )}
                                                        aria-current={isActive ? "page" : undefined}
                                                    >
                                                        {route.label}
                                                    </Link>
                                                );
                                            })}
                                        </nav>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
