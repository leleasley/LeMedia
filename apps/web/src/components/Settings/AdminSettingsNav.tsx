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
    color: string;
    gradient: string;
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
            icon: Cog6ToothIcon,
            color: "slate",
            gradient: "from-slate-500/20 to-gray-500/20",
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
            color: "purple",
            gradient: "from-purple-500/20 to-violet-500/20",
            routes: [
                { id: "media-server", label: mediaServerLabel, href: mediaServerRoute, match: /^\/admin\/settings\/media-servers/, icon: ServerIcon },
                { id: "services", label: "Services", href: "/admin/settings/services", match: /^\/admin\/settings\/services/, icon: RectangleStackIcon },
                { id: "metadata", label: "Metadata", href: "/admin/settings/metadata", match: /^\/admin\/settings\/metadata/, icon: FilmIcon },
                { id: "upgrade-finder", label: "Upgrade Finder", href: "/admin/settings/upgrade-finder", match: /^\/admin\/settings\/upgrade-finder/, icon: ArrowUpCircleIcon },
            ]
        },
        {
            id: "users-auth",
            label: "Users & Auth",
            icon: UserGroupIcon,
            color: "blue",
            gradient: "from-blue-500/20 to-indigo-500/20",
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
            color: "emerald",
            gradient: "from-emerald-500/20 to-green-500/20",
            routes: [
                { id: "approval-rules", label: "Approval Rules", href: "/admin/settings/approval-rules", match: /^\/admin\/settings\/approval-rules/, icon: ShieldCheckIcon },
                { id: "shares", label: "Share Links", href: "/admin/settings/shares", match: /^\/admin\/settings\/shares/, icon: ShareIcon },
                { id: "analytics", label: "Analytics", href: "/admin/settings/analytics", match: /^\/admin\/settings\/analytics/, icon: ChartBarIcon },
            ]
        },
        {
            id: "notifications",
            label: "Notifications",
            icon: BellIcon,
            color: "amber",
            gradient: "from-amber-500/20 to-orange-500/20",
            routes: [
                { id: "notifications", label: "Notifications", href: "/admin/settings/notifications", match: /^\/admin\/settings\/notifications/, icon: BellIcon },
            ]
        },
    ];

    const colorStyles: Record<string, { text: string; bg: string; border: string; activeBg: string; activeText: string }> = {
        slate: { text: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/20", activeBg: "bg-slate-500/20", activeText: "text-slate-200" },
        purple: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", activeBg: "bg-purple-500/20", activeText: "text-purple-200" },
        blue: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", activeBg: "bg-blue-500/20", activeText: "text-blue-200" },
        emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", activeBg: "bg-emerald-500/20", activeText: "text-emerald-200" },
        amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", activeBg: "bg-amber-500/20", activeText: "text-amber-200" },
    };

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
        <div className="space-y-6">
            {/* Header */}
            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-6 md:p-8">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                <div className="relative">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-white/10">
                            <Cog6ToothIcon className="w-7 h-7 text-indigo-300" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
                            <p className="text-sm text-white/60 mt-1">Configure your media server and application</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile dropdown */}
            <div className="sm:hidden">
                <label htmlFor="admin-settings-tabs" className="sr-only">
                    Select a tab
                </label>
                <select
                    id="admin-settings-tabs"
                    value={selectedRoute}
                    onChange={event => router.push(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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

            {/* Desktop grouped navigation */}
            <div className="hidden sm:block">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                    {groups.map(group => {
                        const isOpen = openGroups.has(group.id);
                        const hasActiveRoute = group.routes.some(r => pathname?.match(r.match));
                        const Icon = group.icon;
                        const styles = colorStyles[group.color];

                        return (
                            <div
                                key={group.id}
                                className={cn(
                                    "rounded-2xl border transition-all duration-300",
                                    styles.border,
                                    "bg-gradient-to-br",
                                    group.gradient,
                                    hasActiveRoute && "ring-2 ring-white/20"
                                )}
                            >
                                <button
                                    onClick={() => toggleGroup(group.id)}
                                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "flex items-center justify-center w-10 h-10 rounded-xl ring-1 ring-white/10",
                                            `bg-gradient-to-br ${group.gradient}`
                                        )}>
                                            <Icon className={cn("h-5 w-5", styles.text)} />
                                        </div>
                                        <span className="font-semibold text-white">
                                            {group.label}
                                        </span>
                                    </div>
                                    <ChevronDownIcon
                                        className={cn(
                                            "h-5 w-5 transition-transform duration-300",
                                            styles.text,
                                            isOpen ? "rotate-180" : ""
                                        )}
                                    />
                                </button>
                                <div className={cn(
                                    "overflow-hidden transition-all duration-300",
                                    isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                                )}>
                                    <div className="border-t border-white/10 px-4 py-3">
                                        <nav className="flex flex-col gap-1" aria-label={`${group.label} settings`}>
                                            {group.routes.map(route => {
                                                const isActive = pathname?.match(route.match);
                                                const RouteIcon = route.icon;
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
                                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                                            isActive
                                                                ? `${styles.activeBg} ${styles.activeText}`
                                                                : "text-white/60 hover:bg-white/5 hover:text-white"
                                                        )}
                                                        aria-current={isActive ? "page" : undefined}
                                                    >
                                                        <RouteIcon className="h-4 w-4" />
                                                        {route.label}
                                                    </Link>
                                                );
                                            })}
                                        </nav>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
