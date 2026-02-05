"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { AlertTriangle, Settings, LayoutGrid, Film, Tv, Inbox, Users, CalendarDays, Activity, Star } from "lucide-react";
import { MobileNav } from "@/components/Layout/MobileNav";
import { SearchHeader } from "@/components/Layout/SearchHeader";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { getAvatarSrc } from "@/lib/avatar";
import { PWAInstallButton } from "@/components/PWA/InstallButton";
import { WebPushPrompt } from "@/components/Push/WebPushPrompt";
import { PullToRefresh } from "@/components/PWA/PullToRefresh";
import { SessionResetModal } from "@/components/auth/SessionResetModal";

interface AppLayoutClientProps {
    children: React.ReactNode;
    isAdmin: boolean;
    pendingRequestsCount?: number;
    issuesCount?: number;
    profile?: {
        username: string;
        email: string | null;
        avatarUrl?: string | null;
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
        email: string | null;
        avatarUrl?: string | null;
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
    sidebarFooterText = "LeMedia v0.1.0"
}: AppLayoutClientProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
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
        setProgressVisible(true);
        setProgressValue(8);
        timers.push(window.setTimeout(() => setProgressValue(28), 90));
        timers.push(window.setTimeout(() => setProgressValue(52), 220));
        timers.push(window.setTimeout(() => setProgressValue(76), 420));
        timers.push(window.setTimeout(() => setProgressValue(92), 700));
        timers.push(window.setTimeout(() => setProgressValue(100), 1000));
        timers.push(window.setTimeout(() => setProgressVisible(false), 1300));
        return () => {
            timers.forEach((t) => window.clearTimeout(t));
        };
    }, [pathname, searchParams?.toString()]);

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

    const linkClass = (isActive: boolean) => cn(
        "flex items-center gap-4 px-4 py-3 mx-2 rounded-lg transition-all text-sm font-medium border-l-4",
        isActive 
            ? "bg-white/10 text-white border-indigo-500 shadow-sm" 
            : "text-gray-400 hover:text-white hover:bg-white/5 border-transparent"
    );

    return (
        <>
            <div
                className={cn(
                    "fixed left-0 top-0 z-[2000] h-0.5 bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-500 transition-[width,opacity] duration-500 ease-out",
                    progressVisible ? "opacity-100" : "opacity-0"
                )}
                style={{ width: `${progressValue}%` }}
            />
            <WebPushPrompt />
            <SessionResetModal />
            <PullToRefresh>
            {/* Mobile Navigation */}
            <MobileNav isAdmin={isAdmin} pendingRequestsCount={pendingCount} issuesCount={openIssuesCount}>
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
                                <PrefetchLink href="/" className={linkClass(pathname === "/")}>
                                    <LayoutGrid className="h-5 w-5" />
                                    <span>Dashboard</span>
                                </PrefetchLink>
                                <PrefetchLink href="/my-activity" className={linkClass(pathname === "/my-activity")}>
                                    <Activity className="h-5 w-5" />
                                    <span>My Activity</span>
                                </PrefetchLink>
                                <PrefetchLink href="/reviews" className={linkClass(pathname === "/reviews")}>
                                    <Star className="h-5 w-5" />
                                    <span>Reviews</span>
                                </PrefetchLink>
                                <PrefetchLink href="/movies" className={linkClass(pathname === "/movies")}>
                                    <Film className="h-5 w-5" />
                                    <span>Movies</span>
                                </PrefetchLink>
                                <PrefetchLink href="/tv" className={linkClass(pathname === "/tv")}>
                                    <Tv className="h-5 w-5" />
                                    <span>TV Shows</span>
                                </PrefetchLink>
                                <PrefetchLink href="/calendar" className={linkClass(pathname === "/calendar")}>
                                    <CalendarDays className="h-5 w-5" />
                                    <span>Calendar</span>
                                </PrefetchLink>
                            </div>
                        </div>

                        {/* Requests Section - Only show for non-admins */}
                        {!isAdmin && (
                            <div>
                                <h3 className="text-xs font-bold text-gray-500 mb-2 px-6 uppercase tracking-wider">Collection</h3>
                                <div className="space-y-1">
                                    <PrefetchLink href="/requests" className={linkClass(pathname === "/requests")}>
                                        <Inbox className="h-5 w-5" />
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
                                    <PrefetchLink href="/admin/requests" className={linkClass(pathname === "/admin/requests")}>
                                        <Inbox className="h-5 w-5" />
                                        <span>All Requests</span>
                                        {pendingCount > 0 && (
                                            <span className="ml-auto flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-indigo-500 text-[10px] font-bold text-white shadow-sm">
                                                {pendingCount}
                                            </span>
                                        )}
                                    </PrefetchLink>
                                    <PrefetchLink href="/admin/users" className={linkClass(pathname?.startsWith("/admin/users") ?? false)}>
                                        <Users className="h-5 w-5" />
                                        <span>Users</span>
                                    </PrefetchLink>
                                    <PrefetchLink href="/admin/issues" className={linkClass(pathname?.startsWith("/admin/issues") ?? false)}>
                                        <AlertTriangle className="h-5 w-5" />
                                        <span>Issues</span>
                                        {openIssuesCount > 0 && (
                                            <span className="ml-auto flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm">
                                                {openIssuesCount}
                                            </span>
                                        )}
                                    </PrefetchLink>
                                    <PrefetchLink href="/admin/settings/general" className={linkClass(pathname?.startsWith("/admin/settings") ?? false)}>
                                        <div className="flex items-center gap-4 flex-1">
                                            <Settings className="h-5 w-5" />
                                            <span>Settings</span>
                                        </div>
                                    </PrefetchLink>
                                </div>
                            </div>
                        )}
                    </nav>

                    <div className="p-4 border-t border-white/5 mt-auto bg-black/20">
                         <div className="text-xs text-gray-500 text-center">
                             {sidebarFooterText}
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
