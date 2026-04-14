"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, LogOut, Search, Settings, User, Clock, X } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { getAvatarAlt, getAvatarSrc } from "@/lib/avatar";
import { NotificationBell } from "@/components/Notifications/NotificationBell";
import { performLogout } from "@/lib/logout-client";

type ProfileSummary = {
    username: string;
    displayName?: string | null;
    email: string | null;
    avatarUrl?: string | null;
    avatarVersion?: number | null;
    jellyfinUserId?: string | null;
};

// ---------------------------------------------------------------------------
// Recent-searches helpers (localStorage only, no DB)
// ---------------------------------------------------------------------------

const MAX_RECENT = 8;
const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 600; // prevent hammering the server on every keystroke

function getStorageKey(username?: string) {
    return username ? `recentSearches:${username}` : "recentSearches:global";
}

function loadRecentSearches(username?: string): string[] {
    try {
        const raw = window.localStorage.getItem(getStorageKey(username));
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT) : [];
    } catch {
        return [];
    }
}

function saveRecentSearches(items: string[], username?: string) {
    try {
        window.localStorage.setItem(getStorageKey(username), JSON.stringify(items.slice(0, MAX_RECENT)));
    } catch {
        // localStorage quota / private-browsing – safe to ignore
    }
}

// ---------------------------------------------------------------------------

function SearchHeaderForm({ initialQuery, isAdmin, initialProfile }: { initialQuery: string; isAdmin: boolean; initialProfile?: ProfileSummary | null }) {
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [profile, setProfile] = useState<ProfileSummary | null>(initialProfile ?? null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLDivElement | null>(null);
    const [recentOpen, setRecentOpen] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [searchFocused, setSearchFocused] = useState(false);
    const shortcutLabel = "Ctrl/Cmd+K";

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    // Sync input with external query changes (e.g. back/forward navigation)
    useEffect(() => {
        if (initialQuery === searchQuery) return;
        if (inputRef.current === document.activeElement) return;
        const id = window.setTimeout(() => setSearchQuery(initialQuery), 0);
        return () => window.clearTimeout(id);
    }, [initialQuery, searchQuery]);

    // Sync profile prop
    useEffect(() => {
        if (initialProfile) return;
        const id = window.setTimeout(() => setProfile(null), 0);
        return () => window.clearTimeout(id);
    }, [initialProfile]);

    // Load recent searches from localStorage once per user
    useEffect(() => {
        const items = loadRecentSearches(profile?.username);
        const id = window.setTimeout(() => {
            setRecentSearches((prev) => {
                if (prev.length === items.length && prev.every((item, index) => item === items[index])) {
                    return prev;
                }
                return items;
            });
        }, 0);
        return () => window.clearTimeout(id);
    }, [profile?.username]);

    // Close menus on outside click
    useEffect(() => {
        if (!menuOpen && !recentOpen) return;
        const onClick = (event: MouseEvent) => {
            if (menuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
            if (recentOpen && searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setRecentOpen(false);
            }
        };
        window.addEventListener("click", onClick);
        return () => window.removeEventListener("click", onClick);
    }, [menuOpen, recentOpen]);

    useEffect(() => {
        const shouldIgnoreTarget = (target: EventTarget | null) => {
            if (!(target instanceof Element)) return false;
            const tag = target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
            if ((target as HTMLElement).isContentEditable) return true;
            return false;
        };

        const onGlobalKeyDown = (event: KeyboardEvent) => {
            if (shouldIgnoreTarget(event.target)) return;

            const isQuickSearchShortcut = (event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey);
            const isSlashShortcut = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
            if (!isQuickSearchShortcut && !isSlashShortcut) return;

            event.preventDefault();
            inputRef.current?.focus();
            setRecentOpen(true);
            const input = inputRef.current;
            if (input && input.value.length > 0) {
                input.setSelectionRange(0, input.value.length);
            }
        };

        window.addEventListener("keydown", onGlobalKeyDown);
        return () => window.removeEventListener("keydown", onGlobalKeyDown);
    }, []);

    // ---- Recent-search mutations (only on explicit user actions) ----------

    const persistRecent = useCallback((items: string[]) => {
        const capped = items.slice(0, MAX_RECENT);
        setRecentSearches(capped);
        saveRecentSearches(capped, profile?.username);
    }, [profile?.username]);

    /** Add a term to recent searches – call ONLY on intentional submit / click */
    const addRecent = useCallback((value: string) => {
        const trimmed = value.trim();
        if (trimmed.length < MIN_SEARCH_LENGTH) return;
        setRecentSearches((prev) => {
            // Dedupe (case-insensitive) and prepend
            const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
            saveRecentSearches(next, profile?.username);
            return next;
        });
    }, [profile?.username]);

    const removeRecent = useCallback((term: string) => {
        setRecentSearches((prev) => {
            const next = prev.filter((item) => item.toLowerCase() !== term.toLowerCase());
            saveRecentSearches(next, profile?.username);
            return next;
        });
    }, [profile?.username]);

    // ---- Input / form handlers -------------------------------------------

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchQuery(value);

        // Cancel any pending navigation
        if (debounceRef.current) clearTimeout(debounceRef.current);

        // Only navigate after the user pauses typing (DEBOUNCE_MS)
        // Does NOT save to recent searches – that only happens on submit
        if (value.trim().length >= MIN_SEARCH_LENGTH) {
            debounceRef.current = setTimeout(() => {
                router.push(`/search?q=${encodeURIComponent(value.trim())}&type=all`);
            }, DEBOUNCE_MS);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const q = searchQuery.trim();
        if (q.length < MIN_SEARCH_LENGTH) return;

        // Cancel any pending debounce – user explicitly submitted
        if (debounceRef.current) clearTimeout(debounceRef.current);

        router.push(`/search?q=${encodeURIComponent(q)}&type=all`);
        addRecent(q); // only save on explicit submit
        setRecentOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            setSearchQuery("");
            setRecentOpen(false);
        }
    };

    const avatarSrc = getAvatarSrc(profile);
    const displayName = profile?.displayName?.trim() ? profile.displayName : profile?.username;
    const avatarAlt = getAvatarAlt(profile, displayName ?? "User");

    return (
        <div className="flex items-center gap-1.5 sm:gap-2 w-full">
            <form onSubmit={handleSearch} className="flex-1" autoComplete="off">
                <div className="relative w-full" ref={searchRef}>
                    <Search className="pointer-events-none absolute right-2.5 sm:right-3 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-gray-400 z-10" />
                    {!searchFocused && !searchQuery.trim() ? (
                        <span className="pointer-events-none absolute right-8 sm:right-11 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded-md border border-white/30 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                            {shortcutLabel}
                        </span>
                    ) : null}
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search Movies & TV"
                        value={searchQuery}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                            setSearchFocused(true);
                            setRecentOpen(true);
                        }}
                        onBlur={() => setSearchFocused(false)}
                        className="block w-full rounded-full border border-white/10 bg-white/8 py-1.5 sm:py-2 pl-3 sm:pl-4 pr-8 sm:pr-11 text-sm sm:text-base text-white placeholder-gray-500 hover:border-white/20 focus:border-white/30 focus:bg-white/12 focus:placeholder-gray-400 focus:outline-none focus:ring-0 relative transition-all duration-200"
                    />
                    {recentOpen && recentSearches.length > 0 ? (
                        <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-white/10 shadow-md z-50 bg-slate-900 overflow-hidden backdrop-blur-xl">
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-slate-800/50">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-3.5 w-3.5 text-white/40" />
                                    <span className="text-xs uppercase tracking-wider text-white/50 font-semibold">Recent searches</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => persistRecent([])}
                                    className="text-xs text-white/60 hover:text-white transition-colors font-medium"
                                >
                                    Clear
                                </button>
                            </div>
                            <div className="max-h-56 overflow-y-auto">
                                {recentSearches.map((item) => (
                                    <div
                                        key={item}
                                        className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-white/90 hover:text-white hover:bg-white/10 transition-all group border-b border-white/5 last:border-b-0"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (debounceRef.current) clearTimeout(debounceRef.current);
                                                setSearchQuery(item);
                                                addRecent(item);
                                                router.push(`/search?q=${encodeURIComponent(item)}&type=all`);
                                                setRecentOpen(false);
                                            }}
                                            className="flex-1 text-left truncate group-hover:text-indigo-300 transition-colors"
                                        >
                                            {item}
                                        </button>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeRecent(item);
                                                }}
                                                className="p-0.5 rounded-full text-white/30 hover:text-red-400 hover:bg-white/10 transition-colors"
                                                title="Remove"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                            <Search className="h-3.5 w-3.5 text-white/40 group-hover:text-indigo-400 transition-colors" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
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
                    <div
                        className="absolute right-0 mt-2 w-52 sm:w-56 rounded-2xl border border-white/10 shadow-md z-50 bg-slate-900 animate-ios-bounce-in overflow-hidden"
                    >
                        <div className="px-4 py-3 border-b border-white/10 bg-slate-800/50">
                            <div className="text-sm font-semibold text-white truncate">{displayName ?? "User"}</div>
                            <div className="text-xs text-white/60 truncate mt-0.5">{profile?.email ?? "No email"}</div>
                        </div>
                        <div className="py-1">
                            <Link
                                href="/profile"
                                prefetch={false}
                                className="ios-pressable flex items-center gap-3 px-4 py-2.5 text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                                onClick={() => setMenuOpen(false)}
                            >
                                <User className="h-4 w-4" />
                                Profile
                            </Link>
                            <Link
                                href="/watchlist"
                                prefetch={false}
                                className="ios-pressable flex items-center gap-3 px-4 py-2.5 text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                                onClick={() => setMenuOpen(false)}
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                Watchlist
                            </Link>
                            <Link
                                href="/favorites"
                                prefetch={false}
                                className="ios-pressable flex items-center gap-3 px-4 py-2.5 text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                                onClick={() => setMenuOpen(false)}
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                                Favorites
                            </Link>
                            <Link
                                href="/lists"
                                prefetch={false}
                                className="ios-pressable flex items-center gap-3 px-4 py-2.5 text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                                onClick={() => setMenuOpen(false)}
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                                My Lists
                            </Link>
                            <Link
                                href="/requests"
                                prefetch={false}
                                className="ios-pressable flex items-center gap-3 px-4 py-2.5 text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                                onClick={() => setMenuOpen(false)}
                            >
                                <Inbox className="h-4 w-4" />
                                Requests
                            </Link>
                            {isAdmin ? (
                                <Link
                                    href="/admin/settings"
                                    prefetch={false}
                                    className="ios-pressable flex items-center gap-3 px-4 py-2.5 text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    <Settings className="h-4 w-4" />
                                    Admin Settings
                                </Link>
                            ) : null}
                            <div className="border-t border-white/10 mt-1 pt-1">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setMenuOpen(false);
                                        setTimeout(() => {
                                            performLogout();
                                        }, 100);
                                    }}
                                    className="ios-pressable flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors w-full text-left"
                                >
                                    <LogOut className="h-4 w-4" />
                                    Sign Out
                                </button>
                            </div>
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
