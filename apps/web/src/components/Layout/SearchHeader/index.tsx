"use client";

import { useEffect, useRef, useState } from "react";
import { Inbox, LogOut, Search, Settings, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getAvatarAlt, getAvatarSrc } from "@/lib/avatar";
import { NotificationBell } from "@/components/Notifications/NotificationBell";

type ProfileSummary = {
    username: string;
    email: string | null;
    avatarUrl?: string | null;
    jellyfinUserId?: string | null;
};

function SearchHeaderForm({ initialQuery, isAdmin, initialProfile }: { initialQuery: string; isAdmin: boolean; initialProfile?: ProfileSummary | null }) {
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [profile, setProfile] = useState<ProfileSummary | null>(initialProfile ?? null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    useEffect(() => {
        if (initialQuery === searchQuery) return;
        const isFocused = inputRef.current === document.activeElement;
        if (!isFocused) {
            const id = window.setTimeout(() => setSearchQuery(initialQuery), 0);
            return () => window.clearTimeout(id);
        }
    }, [initialQuery, searchQuery]);

    useEffect(() => {
        if (initialProfile) return;
        const id = window.setTimeout(() => setProfile(null), 0);
        return () => window.clearTimeout(id);
    }, [initialProfile]);

    useEffect(() => {
        if (!menuOpen) return;
        const onClick = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        window.addEventListener("click", onClick);
        return () => window.removeEventListener("click", onClick);
    }, [menuOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchQuery(value);

        // Auto-navigate to search results when user types
        if (value.trim().length >= 2) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                router.push(`/search?q=${encodeURIComponent(value.trim())}&type=all`);
            }, 200);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const q = searchQuery.trim();
        if (q.length >= 2) {
            router.push(`/search?q=${encodeURIComponent(q)}&type=all`);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            setSearchQuery("");
        }
    };

    const avatarSrc = getAvatarSrc(profile);
    const avatarAlt = getAvatarAlt(profile, profile?.username ?? "User");

    return (
        <div className="flex items-center gap-1.5 sm:gap-2 w-full">
            <form onSubmit={handleSearch} className="flex-1" autoComplete="off">
                <div className="relative w-full">
                    <Search className="pointer-events-none absolute right-2.5 sm:right-3 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-gray-400 z-10" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search Movies & TV"
                        value={searchQuery}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        className="block w-full rounded-full border border-white/10 bg-white/5 py-1.5 sm:py-2 pl-3 sm:pl-4 pr-8 sm:pr-11 text-sm sm:text-base text-white placeholder-gray-500 hover:border-white/20 focus:border-white/30 focus:bg-white/10 focus:placeholder-gray-400 focus:outline-none focus:ring-0 relative"
                    />
                </div>
            </form>
            <NotificationBell />
            <div className="relative" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setMenuOpen(prev => !prev)}
                    className="flex items-center gap-2 rounded-full p-0.5 sm:p-1 text-sm text-white hover:bg-white/5 transition"
                >
                    <span className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white/10 text-sm font-semibold overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={avatarSrc}
                            alt={avatarAlt}
                            className="h-full w-full object-cover"
                            loading="eager"
                            decoding="async"
                            fetchPriority="high"
                        />
                    </span>
                </button>
                {menuOpen ? (
                    <div className="absolute right-0 mt-2 w-52 sm:w-56 rounded-xl sm:rounded-2xl border border-white/10 bg-[#0f172a]/98 shadow-xl backdrop-blur z-50">
                        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/10">
                            <div className="text-sm font-semibold text-white truncate">{profile?.username ?? "User"}</div>
                            <div className="text-[11px] sm:text-xs text-white/50 truncate">{profile?.email ?? "No email"}</div>
                        </div>
                        <div className="py-1.5 sm:py-2">
                            <Link
                                href="/profile"
                                prefetch={false}
                                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-sm text-white/80 hover:text-white hover:bg-white/5"
                                onClick={() => setMenuOpen(false)}
                            >
                                <User className="h-4 w-4" />
                                Profile
                            </Link>
                            <Link
                                href="/watchlist"
                                prefetch={false}
                                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-sm text-white/80 hover:text-white hover:bg-white/5"
                                onClick={() => setMenuOpen(false)}
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                My Watchlist
                            </Link>
                            <Link
                                href="/favorites"
                                prefetch={false}
                                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-sm text-white/80 hover:text-white hover:bg-white/5"
                                onClick={() => setMenuOpen(false)}
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                                My Favorites
                            </Link>
                            <Link
                                href="/requests"
                                prefetch={false}
                                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-sm text-white/80 hover:text-white hover:bg-white/5"
                                onClick={() => setMenuOpen(false)}
                            >
                                <Inbox className="h-4 w-4" />
                                Requests
                            </Link>
                            {isAdmin ? (
                                <Link
                                    href="/admin/settings"
                                    prefetch={false}
                                    className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-sm text-white/80 hover:text-white hover:bg-white/5"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    <Settings className="h-4 w-4" />
                                    Settings
                                </Link>
                            ) : null}
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    setMenuOpen(false);
                                    // Force full page navigation for proper cookie clearing and OIDC redirect
                                    setTimeout(() => {
                                        window.location.assign('/logout');
                                    }, 100);
                                }}
                                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-sm text-white/80 hover:text-white hover:bg-white/5 w-full text-left cursor-pointer"
                            >
                                <LogOut className="h-4 w-4" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function SearchHeader({ isAdmin = false, initialProfile = null }: { isAdmin?: boolean; initialProfile?: ProfileSummary | null }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const initialQuery = pathname === "/search" ? decodeURIComponent(searchParams.get("q") ?? "") : "";

    return <SearchHeaderForm initialQuery={initialQuery} isAdmin={isAdmin} initialProfile={initialProfile} />;
}
