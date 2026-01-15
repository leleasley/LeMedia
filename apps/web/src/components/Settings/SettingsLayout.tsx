"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Cog6ToothIcon,
    UserGroupIcon,
    BellIcon,
    ServerIcon,
    KeyIcon
} from "@heroicons/react/24/outline";

interface SettingsRoute {
    text: string;
    route: string;
    regex: RegExp;
    icon: React.ComponentType<{ className?: string }>;
}

const settingsRoutes: SettingsRoute[] = [
    {
        text: "General",
        route: "/admin/settings/general",
        regex: /^\/admin\/settings\/general/,
        icon: Cog6ToothIcon,
    },
    {
        text: "Users",
        route: "/admin/settings/users",
        regex: /^\/admin\/settings\/users/,
        icon: UserGroupIcon,
    },
    {
        text: "Jellyfin",
        route: "/admin/settings/jellyfin",
        regex: /^\/admin\/settings\/jellyfin/,
        icon: ServerIcon,
    },
    {
        text: "OIDC",
        route: "/admin/settings/oidc",
        regex: /^\/admin\/settings\/oidc/,
        icon: KeyIcon,
    },
    {
        text: "Notifications",
        route: "/admin/settings/notifications",
        regex: /^\/admin\/settings\/notifications/,
        icon: BellIcon,
    },
];

interface SettingsLayoutProps {
    children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
    const pathname = usePathname();

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar */}
            <aside className="lg:w-64 flex-shrink-0">
                <nav className="space-y-1">
                    {settingsRoutes.map((route) => {
                        const isActive = route.regex.test(pathname);
                        const Icon = route.icon;

                        return (
                            <Link
                                key={route.route}
                                href={route.route}
                                className={`
                                    flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                                    ${isActive
                                        ? "bg-indigo-600 text-white"
                                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                                    }
                                `}
                            >
                                <Icon className="w-5 h-5" />
                                {route.text}
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            {/* Content */}
            <main className="flex-1 min-w-0">
                {children}
            </main>
        </div>
    );
}
