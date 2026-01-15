"use client";

import { ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import Image from "next/image";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import useSWR from "swr";
import { getAvatarAlt, getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";

interface User {
    id: number;
    email: string;
    displayName: string;
    isAdmin: boolean;
    createdAt: string;
    avatarUrl: string | null;
    jellyfinUserId: string | null;
    jellyfinUsername: string | null;
}

export function UserSettingsLayoutClient({ children }: { children: ReactNode }) {
    const params = useParams();
    const pathname = usePathname();
    const userId = params?.id as string;

    const { data: user, error } = useSWR<User>(userId ? `/api/v1/admin/users/${userId}` : null);

    const avatarSrc = getAvatarSrc({
        avatarUrl: user?.avatarUrl,
        jellyfinUserId: user?.jellyfinUserId,
        displayName: user?.displayName,
        email: user?.email
    });
    const avatarAlt = getAvatarAlt({ displayName: user?.displayName, email: user?.email });

    const tabs = [
        { name: "General", href: `/admin/users/${userId}/settings`, active: pathname === `/admin/users/${userId}/settings` },
        { name: "Linked Accounts", href: `/admin/users/${userId}/settings/linked-accounts`, active: pathname?.includes("linked-accounts") },
        { name: "Permissions", href: `/admin/users/${userId}/settings/permissions`, active: pathname?.includes("permissions") },
    ];

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                Failed to load user settings
            </div>
        );
    }

    return (
        <section className="space-y-6">
            {/* Profile Header */}
            {user && (
                <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6">
                    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                        <div className="relative h-20 w-20 overflow-hidden rounded-full bg-gray-800">
                            <Image
                                src={avatarSrc}
                                alt={avatarAlt}
                                fill
                                className="object-cover"
                                unoptimized={shouldBypassNextImage(avatarSrc)}
                            />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">{user.displayName || user.email}</h2>
                            <p className="text-gray-400">{user.email}</p>
                            {user.jellyfinUsername && (
                                <p className="text-xs text-indigo-300">Jellyfin: {user.jellyfinUsername}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Tabs */}
            <div className="border-b border-white/10">
                <nav className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 md:mx-0 md:gap-8 md:overflow-visible md:pb-0">
                    {tabs.map((tab) => (
                        <PrefetchLink
                            key={tab.name}
                            href={tab.href}
                            className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition md:rounded-none md:px-0 md:py-0 md:pb-4 md:text-sm md:border-b-2 ${tab.active
                                    ? "bg-indigo-500/15 text-indigo-300 md:border-indigo-500 md:bg-transparent"
                                    : "text-gray-400 hover:text-gray-200 md:border-transparent"
                                }`}
                        >
                            {tab.name}
                        </PrefetchLink>
                    ))}
                </nav>
            </div>

            {/* Settings Content */}
            <div>{children}</div>
        </section>
    );
}
