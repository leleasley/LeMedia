"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { AlertTriangle, Settings, LayoutGrid, Compass, Film, Tv, Inbox, Users, CalendarDays, Activity, Star, Sparkles, Heart, Bell, Search } from "lucide-react";
import { MobileNav } from "@/components/Layout/MobileNav";
import { SearchHeader } from "@/components/Layout/SearchHeader";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { getAvatarSrc } from "@/lib/avatar";
import { PWAInstallButton } from "@/components/PWA/InstallButton";
import { WebPushPrompt } from "@/components/Push/WebPushPrompt";
import { PullToRefresh } from "@/components/PWA/PullToRefresh";
import { SessionResetModal } from "@/components/auth/SessionResetModal";
import { subscribeRequestsChanged } from "@/lib/request-refresh";

interface AppLayoutClientProps {
    children: React.ReactNode;
    isAdmin: boolean;
    pendingRequestsCount?: number;
    issuesCount?: number;
    profile?: {
        username: string;
        displayName?: string | null;
        email: string | null;
        avatarUrl?: string | null;
        avatarVersion?: number | null;
        jellyfinUserId?: string | null;
    } | null;
    imageProxyEnabled: boolean;
    maintenance?: { enabled: boolean; message?: string | null };
    sidebarFooterText?: string;
}

function MaintenanceBanner({ maintenance }: { maintenance?: { enabled: boolean; message?: string | null } }) {
    if (!maintenance?.enabled) return null;
    return (
        <div className="mb-4 flex gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-amber-50 shadow-inner shadow-amber-900/30">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-300" />
            <div className="space-y-1">
                <div className="font-semibold text-amber-50">Maintenance mode</div>
                <p className="text-sm text-amber-100/80">
                    {maintenance.message || "New requests are temporarily disabled while maintenance is in progress."}
                </p>
            </div>
        </div>
    );
}

function AppHeader({
    isDesktop,
    isAdmin,
    profile
}: {
    isDesktop: boolean | null;
    isAdmin: boolean;
    profile: {
        username: string;
        displayName?: string | null;
        email: string | null;
        avatarUrl?: string | null;
        avatarVersion?: number | null;
        jellyfinUserId?: string | null;
    } | null;
}) {
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        let rafId = 0;
        const update = () => {
            rafId = 0;
            // Listen to the main content area scrolling instead of window
            const mainContent = document.querySelector('main');
            if (mainContent) {
                const next = mainContent.scrollTop > 4;
                setIsScrolled(prev => (prev === next ? prev : next));
            }
        };
        const mainContent = document.querySelector('main');
        const handleScroll = () => {
            if (rafId) return;
            rafId = window.requestAnimationFrame(update);
        };
        if (mainContent) {
            mainContent.addEventListener("scroll", handleScroll, { passive: true });
        }
        handleScroll();
        return () => {
            if (mainContent) {
                mainContent.removeEventListener("scroll", handleScroll);
            }
            if (rafId) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, []);

    if (isDesktop === null) return null;

    return (
        <>
            {/* Mobile header - iOS liquid glass style */}
            {isDesktop === false ? (
                <div
                    data-search-header
                    className={cn(
                        "fixed left-0 right-0 top-0 z-[60] flex flex-shrink-0 transition-all duration-300",
                        isScrolled
                            ? "liquid-glass border-b border-white/10"
                            : "bg-transparent"
                    )}
                    style={{
                        paddingTop: "max(env(safe-area-inset-top), 0.5rem)",
                        height: "calc(3.5rem + max(env(safe-area-inset-top), 0.5rem))"
                    }}
                >
                    <div className="flex flex-1 items-center justify-between px-3">
                        <SearchHeader isAdmin={isAdmin} initialProfile={profile} />
                    </div>
                </div>
            ) : null}

            {/* Desktop: fixed search at top - with proper width accounting for sidebar */}
            {isDesktop ? (
                <div
                    data-search-header
                    className={cn(
                        "fixed top-0 z-[60] flex flex-shrink-0 px-4 py-3 right-0",
                        "md:left-64",
                        isScrolled
                            ? "bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-white/5 transition duration-300"
                            : "bg-transparent border-b border-transparent transition-none"
                    )}
                    style={{
                        width: "calc(100% - 16rem)" // 16rem = 256px sidebar width
                    }}
                >
                    <div className="flex flex-1 items-center justify-end gap-4">
                        <SearchHeader isAdmin={isAdmin} initialProfile={profile} />
                        <PWAInstallButton />
                    </div>
                </div>
            ) : null}
        </>
    );
}

export default function AppLayoutClient({
    children,
    isAdmin,
    pendingRequestsCount = 0,
    issuesCount = 0,
    profile = null,
    imageProxyEnabled,
    maintenance,
    sidebarFooterText = "LeMedia v0.1.0",
}: AppLayoutClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchParamsKey = searchParams?.toString() ?? "";
    const isDesktop = useMediaQuery("(min-width: 768px)", null);
    const [liveCounts, setLiveCounts] = useState<{ pending?: number; open?: number } | null>(null);
    const [progressVisible, setProgressVisible] = useState(false);
    const [progressValue, setProgressValue] = useState(0);
    const { data: requestCounts } = useSWR<{ pending?: number }>(
        isAdmin ? "/api/v1/requests/count" : null,
        {
            refreshInterval: 30000,
            revalidateOnFocus: true,
        }
    );
    useSWR(
        "/api/v1/auth/me",
        {
            refreshInterval: 30000,
            revalidateOnFocus: true,
            onError: (err) => {
                if (err?.status === 401) {
                    window.location.href = "/login";
                }
            },
        }
    );
    const { data: issueCounts } = useSWR<{ open?: number }>(
        isAdmin ? "/api/v1/issues/count" : null,
        {
            refreshInterval: 30000,
            revalidateOnFocus: true,
        }
    );
    useSWR(
        isAdmin ? "/api/v1/status" : null,
        {
            refreshInterval: 60 * 1000,
            revalidateOnFocus: true,
        }
    );
    const { data: maintenanceData } = useSWR<{ state?: { enabled: boolean; message?: string | null } }>(
        "/api/maintenance",
        { refreshInterval: 5000, revalidateOnFocus: true }
    );
    const liveMaintenance = maintenanceData?.state ?? maintenance;

    useEffect(() => {
        if (!isAdmin) return;
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let eventSource: EventSource | null = null;

        const connect = () => {
            if (cancelled) return;
            eventSource = new EventSource("/api/v1/stream/admin-counts");

            eventSource.addEventListener("counts", (event) => {
                if (cancelled) return;
                try {
                    const payload = JSON.parse((event as MessageEvent).data);
                    setLiveCounts({
                        pending: payload?.requests?.pending ?? payload?.pending,
                        open: payload?.issues?.open ?? payload?.open
                    });
                } catch {
                    // Ignore malformed payloads.
                }
            });

            eventSource.onerror = () => {
                eventSource?.close();
                eventSource = null;
                if (cancelled) return;
                retryTimer = setTimeout(connect, 5000);
            };
        };

        connect();

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
            eventSource?.close();
        };
    }, [isAdmin]);

    const pendingCount = liveCounts?.pending ?? requestCounts?.pending ?? pendingRequestsCount;
    const openIssuesCount = liveCounts?.open ?? issueCounts?.open ?? issuesCount;

    useEffect(() => {
        (window as unknown as { __LEMEDIA_IMAGE_PROXY_ENABLED__?: boolean }).__LEMEDIA_IMAGE_PROXY_ENABLED__ = imageProxyEnabled;
    }, [imageProxyEnabled]);

    useEffect(() => {
        if (!profile) return;
        const avatarSrc = getAvatarSrc(profile);
        if (!avatarSrc || avatarSrc.startsWith("data:")) return;

        const existing = document.querySelector(`link[rel="preload"][href="${avatarSrc}"]`);
        if (!existing) {
            const link = document.createElement("link");
            link.rel = "preload";
            link.as = "image";
            link.href = avatarSrc;
            document.head.appendChild(link);
        }

        const img = new window.Image();
        img.decoding = "async";
        img.src = avatarSrc;
    }, [profile]);

    useEffect(() => {
        if (pathname?.startsWith("/settings/profile")) return;
        let cancelled = false;
        const checkSession = async () => {
            try {
                const res = await fetch("/api/v1/auth/me", { credentials: "include" });
                if (!cancelled && res.status === 401) {
                    window.location.href = "/login";
                }
            } catch {
                // Ignore transient network errors; rely on server redirects.
            }
        };
        void checkSession();
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    useEffect(() => {
        if (!pathname) return;
        const timers: number[] = [];
        timers.push(window.setTimeout(() => {
            setProgressVisible(true);
            setProgressValue(8);
        }, 0));
        timers.push(window.setTimeout(() => setProgressValue(28), 90));
        timers.push(window.setTimeout(() => setProgressValue(52), 220));
        timers.push(window.setTimeout(() => setProgressValue(76), 420));
        timers.push(window.setTimeout(() => setProgressValue(92), 700));
        timers.push(window.setTimeout(() => setProgressValue(100), 1000));
        timers.push(window.setTimeout(() => setProgressVisible(false), 1300));
        return () => {
            timers.forEach((t) => window.clearTimeout(t));
        };
    }, [pathname, searchParamsKey]);

    useEffect(() => {
        if (!pathname) return;
        // Reset scroll to top on route change (window + main scroll container)
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
        const mainContent = document.querySelector("main");
        if (mainContent) {
            mainContent.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
    }, [pathname]);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const unsubscribe = subscribeRequestsChanged(() => {
            if (timeout) return;
            timeout = setTimeout(() => {
                timeout = null;
                router.refresh();
            }, 250);
        });
        return () => {
            if (timeout) clearTimeout(timeout);
            unsubscribe();
        };
    }, [router]);

    const linkClass = (isActive: boolean, accent = "border-indigo-500") => cn(
        "flex items-center gap-4 px-4 py-3 mx-2 rounded-lg transition-all text-sm font-medium border-l-4",
        isActive
            ? `bg-white/10 text-white ${accent} shadow-sm`
            : "text-gray-400 hover:text-white hover:bg-white/5 border-transparent"
    );
    const iconClass = (isActive: boolean, activeColor: string) =>
        cn("h-5 w-5 flex-shrink-0 transition-colors", isActive ? activeColor : "");
    const sidebarAvatarSrc = profile ? getAvatarSrc(profile) : "";
    const sidebarAvatarSource = profile?.avatarUrl ? "direct" : profile?.jellyfinUserId ? "proxy" : "fallback";
    const showAvatarDebug = process.env.NODE_ENV !== "production";

    // Section-aware progress bar colour
    const progressBarClass = useMemo(() => {
        const p = pathname ?? "/";
        if (p.startsWith("/admin")) return "from-amber-400 via-amber-300 to-amber-500";
        if (p.startsWith("/social") || p.startsWith("/friends")) return "from-pink-400 via-pink-300 to-pink-500";
        if (p.startsWith("/requests")) return "from-violet-400 via-violet-300 to-violet-500";
        // Browse: everything else
        return "from-sky-400 via-sky-300 to-sky-500";
    }, [pathname]);

    return (
        <>
            <div
                className={cn(
                    "fixed left-0 top-0 z-[2000] h-0.5 bg-gradient-to-r transition-[width,opacity,background] duration-500 ease-out",
                    progressBarClass,
                    progressVisible ? "opacity-100" : "opacity-0"
                )}
                style={{ width: `${progressValue}%` }}
            />
            <WebPushPrompt />
            <SessionResetModal />
            <PullToRefresh>
            {/* Mobile Navigation */}
            <MobileNav isAdmin={isAdmin} pendingRequestsCount={pendingCount} issuesCount={openIssuesCount} profile={profile}>
                <AppHeader isDesktop={isDesktop} isAdmin={isAdmin} profile={profile} />

                {/* Mobile content */}
                <div className="md:hidden px-3 pb-24" style={{ paddingTop: "calc(3.5rem + env(safe-area-inset-top) + 1rem)" }}>
                    <MaintenanceBanner maintenance={liveMaintenance} />
                    {children}
                </div>
            </MobileNav>
            </PullToRefresh>

            {/* Desktop Layout */}
            <div className="hidden md:flex h-screen overflow-hidden bg-[#0b1120]">
                <aside className="w-64 h-screen fixed left-0 top-0 flex-shrink-0 bg-[#0f172a] border-r border-white/5 z-50 overflow-y-auto flex flex-col shadow-xl">
                    <div className="flex items-center justify-between p-6 mb-2">
                        <PrefetchLink href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
                            <Image
                                src="/sidebar.png"
                                alt="LeMedia Logo"
                                width={0}
                                height={0}
                                sizes="100vw"
                                className="h-8 w-auto"
                            />
                        </PrefetchLink>
                        <ModeToggle />
                    </div>

                    <nav className="flex flex-col flex-1 space-y-8 px-2">
                        {/* Browse Section */}
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 mb-2 px-6 uppercase tracking-wider">Browse</h3>
                            <div className="space-y-1">
                                <PrefetchLink href="/" className={linkClass(pathname === "/", "border-sky-400")}>
                                    <LayoutGrid className={iconClass(pathname === "/", "text-sky-400")} />
                                    <span>Home</span>
                                </PrefetchLink>
                                <PrefetchLink href="/discover" className={linkClass(pathname?.startsWith("/discover") ?? false, "border-sky-400")}>
                                    <Compass className={iconClass(pathname?.startsWith("/discover") ?? false, "text-sky-400")} />
                                    <span>Discover</span>
                                </PrefetchLink>
                                <PrefetchLink href="/my-activity" className={linkClass(pathname === "/my-activity", "border-sky-400")}>
                                    <Activity className={iconClass(pathname === "/my-activity", "text-sky-400")} />
                                    <span>My Activity</span>
                                </PrefetchLink>
                                <PrefetchLink href="/recommendations" className={linkClass(pathname === "/recommendations", "border-sky-400")}>
                                    <Sparkles className={iconClass(pathname === "/recommendations", "text-sky-400")} />
                                    <span>Recommendations</span>
                                </PrefetchLink>
                                <PrefetchLink href="/reviews" className={linkClass(pathname === "/reviews", "border-sky-400")}>
                                    <Star className={iconClass(pathname === "/reviews", "text-sky-400")} />
                                    <span>Reviews</span>
                                </PrefetchLink>
                                <PrefetchLink href="/movies" className={linkClass(pathname === "/movies", "border-sky-400")}>
                                    <Film className={iconClass(pathname === "/movies", "text-sky-400")} />
                                    <span>Movies</span>
                                </PrefetchLink>
                                <PrefetchLink href="/tv" className={linkClass(pathname === "/tv", "border-sky-400")}>
                                    <Tv className={iconClass(pathname === "/tv", "text-sky-400")} />
                                    <span>TV Shows</span>
                                </PrefetchLink>
                                <PrefetchLink href="/calendar" className={linkClass(pathname === "/calendar", "border-sky-400")}>
                                    <CalendarDays className={iconClass(pathname === "/calendar", "text-sky-400")} />
                                    <span>Calendar</span>
                                </PrefetchLink>
                            </div>
                        </div>

                        {/* Social Section */}
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 mb-2 px-6 uppercase tracking-wider">Social</h3>
                            <div className="space-y-1">
                                <PrefetchLink href="/social" className={linkClass(pathname === "/social", "border-pink-400")}>
                                    <Heart className={iconClass(pathname === "/social", "text-pink-400")} />
                                    <span>Feed</span>
                                </PrefetchLink>
                                <PrefetchLink href="/friends" className={linkClass(pathname === "/friends", "border-pink-400")}>
                                    <Users className={iconClass(pathname === "/friends", "text-pink-400")} />
                                    <span>Friends</span>
                                </PrefetchLink>
                                <PrefetchLink href="/social/discover" className={linkClass(pathname === "/social/discover", "border-pink-400")}>
                                    <Search className={iconClass(pathname === "/social/discover", "text-pink-400")} />
                                    <span>Discover People</span>
                                </PrefetchLink>
                            </div>
                        </div>

                        {/* Requests Section - Only show for non-admins */}
                        {!isAdmin && (
                            <div>
                                <h3 className="text-xs font-bold text-gray-500 mb-2 px-6 uppercase tracking-wider">Collection</h3>
                                <div className="space-y-1">
                                    <PrefetchLink href="/requests" className={linkClass(pathname === "/requests", "border-violet-400")}>
                                        <Inbox className={iconClass(pathname === "/requests", "text-violet-400")} />
                                        <span>My Requests</span>
                                    </PrefetchLink>
                                </div>
                            </div>
                        )}

                        {/* Admin Section */}
                        {isAdmin && (
                            <div>
                                <h3 className="text-xs font-bold text-gray-500 mb-2 px-6 uppercase tracking-wider">Admin</h3>
                                <div className="space-y-1">
                                    <PrefetchLink href="/admin/requests" className={linkClass(pathname === "/admin/requests", "border-amber-400")}>
                                        <Inbox className={iconClass(pathname === "/admin/requests", "text-amber-400")} />
                                        <span>All Requests</span>
                                        {pendingCount > 0 && (
                                            <span className="ml-auto flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-indigo-500 text-[10px] font-bold text-white shadow-sm">
                                                {pendingCount}
                                            </span>
                                        )}
                                    </PrefetchLink>
                                    <PrefetchLink href="/admin/users" className={linkClass(pathname?.startsWith("/admin/users") ?? false, "border-amber-400")}>
                                        <Users className={iconClass(pathname?.startsWith("/admin/users") ?? false, "text-amber-400")} />
                                        <span>Users</span>
                                    </PrefetchLink>
                                    <PrefetchLink href="/admin/issues" className={linkClass(pathname?.startsWith("/admin/issues") ?? false, "border-amber-400")}>
                                        <AlertTriangle className={iconClass(pathname?.startsWith("/admin/issues") ?? false, "text-amber-400")} />
                                        <span>Issues</span>
                                        {openIssuesCount > 0 && (
                                            <span className="ml-auto flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm">
                                                {openIssuesCount}
                                            </span>
                                        )}
                                    </PrefetchLink>
                                    <PrefetchLink href="/admin/settings/general" className={linkClass(pathname?.startsWith("/admin/settings") ?? false, "border-amber-400")}>
                                        <Settings className={iconClass(pathname?.startsWith("/admin/settings") ?? false, "text-amber-400")} />
                                        <span>Settings</span>
                                    </PrefetchLink>
                                </div>
                            </div>
                        )}
                    </nav>

                    <div className="mt-auto border-t border-white/5 bg-black/20">
                        {profile && (
                            <PrefetchLink
                                href="/settings/profile"
                                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
                            >
                                <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-slate-700">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={sidebarAvatarSrc}
                                        alt={profile.displayName ?? profile.username}
                                        className="h-full w-full object-cover"
                                        loading="eager"
                                        decoding="async"
                                        fetchPriority="high"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold text-gray-200">
                                        {profile.displayName ?? profile.username}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-[10px] text-gray-500">View profile</p>
                                        {showAvatarDebug && (
                                            <span
                                                className="rounded border border-white/15 bg-white/5 px-1 py-[1px] text-[9px] uppercase tracking-wide text-gray-400"
                                                title={sidebarAvatarSrc}
                                            >
                                                {sidebarAvatarSource}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <Settings className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
                            </PrefetchLink>
                        )}
                        <div className="px-4 py-3 border-t border-white/[0.04]">
                            <div className="text-[10px] text-gray-600 text-center mb-2">
                                {sidebarFooterText}
                            </div>
                            <div className="flex justify-center gap-2 text-[9px]">
                                <PrefetchLink href="/privacy" className="text-gray-600 hover:text-gray-400 transition">
                                    Privacy
                                </PrefetchLink>
                                <span className="text-gray-700">·</span>
                                <PrefetchLink href="/cookies" className="text-gray-600 hover:text-gray-400 transition">
                                    Cookies
                                </PrefetchLink>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main content area */}
                <div className="flex-1 flex flex-col min-w-0 md:ml-64 relative bg-[#0b1120]">
                    {/* Fixed header */}
                    <AppHeader isDesktop={isDesktop} isAdmin={isAdmin} profile={profile} />

                    {/* Scrollable content */}
                    <main className="pt-20 z-0 focus:outline-none flex-1 overflow-y-auto relative" tabIndex={0}>
                        <div className="px-3 lg:px-6 pt-6 lg:pt-8 pb-12">
                            <MaintenanceBanner maintenance={liveMaintenance} />
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
