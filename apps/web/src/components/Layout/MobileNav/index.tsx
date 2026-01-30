"use client";

import { Fragment, useMemo, useState, cloneElement, useCallback, useRef } from "react";
import { AlertTriangle, CalendarDays, Clock, Ellipsis, Film, Search, Settings, Sparkles, Tv, Users, X } from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Transition } from "@headlessui/react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { PWAInstallButton } from "@/components/PWA/InstallButton";
import { haptic } from "@/hooks/useHaptic";

interface MobileNavProps {
    isAdmin: boolean;
    pendingRequestsCount?: number;
    issuesCount?: number;
    children: React.ReactNode;
}

type NavLink = {
    href: string;
    label: string;
    icon: typeof Sparkles;
    isActive: boolean;
    badge?: number;
};

export function MobileNav({ isAdmin, pendingRequestsCount = 0, issuesCount = 0, children }: MobileNavProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const pathname = usePathname();

    // Drag-to-dismiss state
    const sheetRef = useRef<HTMLDivElement>(null);
    const dragStartY = useRef<number>(0);
    const currentDragY = useRef<number>(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState(0);

    // Lock body scroll when mobile menu is open
    useLockBodyScroll(isMenuOpen);

    const isMediaPage = useMemo(() => {
        const current = pathname ?? "";
        return current.startsWith("/movie/") || current.startsWith("/tv/") || current.startsWith("/person/");
    }, [pathname]);

    // Handle tab press with haptic feedback
    const handleTabPress = useCallback((href: string) => {
        haptic('selection');
        setActiveTab(href);
        // Reset animation after a short delay
        setTimeout(() => setActiveTab(null), 400);
    }, []);

    const resetDragState = useCallback(() => {
        setDragOffset(0);
        setIsDragging(false);
    }, []);

    // Handle menu toggle with haptic feedback
    const handleMenuToggle = useCallback(() => {
        haptic('medium');
        setIsMenuOpen(prev => {
            const next = !prev;
            if (!next) resetDragState();
            return next;
        });
    }, [resetDragState]);

    // Drag-to-dismiss handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        dragStartY.current = touch.clientY;
        currentDragY.current = touch.clientY;
        setIsDragging(true);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        currentDragY.current = touch.clientY;
        const delta = currentDragY.current - dragStartY.current;
        // Only allow dragging down
        if (delta > 0) {
            setDragOffset(delta);
        }
    }, [isDragging]);

    const handleTouchEnd = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);
        // If dragged more than 80px, close the menu
        if (dragOffset > 80) {
            haptic('light');
            setIsMenuOpen(false);
            resetDragState();
            return;
        }
        setDragOffset(0);
    }, [isDragging, dragOffset, resetDragState]);

    const mainLinks = useMemo<NavLink[]>(() => {
        const current = pathname ?? "/";
        return [
            { href: "/", label: "Home", icon: Sparkles, isActive: current === "/" },
            { href: "/movies", label: "Movies", icon: Film, isActive: current === "/movies" || current.startsWith("/movie/") },
            { href: "/tv", label: "Series", icon: Tv, isActive: current === "/tv" || current.startsWith("/tv/") },
            { href: "/search", label: "Search", icon: Search, isActive: current.startsWith("/search") },
        ];
    }, [pathname]);

    const moreLinks = useMemo<NavLink[]>(() => {
        const current = pathname ?? "/";
        const links: NavLink[] = [
            { href: "/calendar", label: "Calendar", icon: CalendarDays, isActive: current === "/calendar" },
        ];
        if (isAdmin) {
            links.push(
                { href: "/admin/requests", label: "All Requests", icon: Clock, isActive: current.startsWith("/admin/requests"), badge: pendingRequestsCount },
                { href: "/admin/users", label: "Manage Users", icon: Users, isActive: current.startsWith("/admin/users") },
                { href: "/admin/issues", label: "Issues", icon: AlertTriangle, isActive: current.startsWith("/admin/issues"), badge: issuesCount },
                { href: "/admin/settings/general", label: "Admin Settings", icon: Settings, isActive: current.startsWith("/admin/settings") }
            );
        } else {
            links.push(
                { href: "/requests", label: "My Requests", icon: Clock, isActive: current.startsWith("/requests") }
            );
        }
        return links;
    }, [isAdmin, pathname, issuesCount, pendingRequestsCount]);

    const needsMoreButton = moreLinks.length > 0;

    const renderBadge = (value?: number) => {
        if (!value || value <= 0) return null;
        return (
            <span className="absolute left-4 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-md border border-indigo-600 bg-gradient-to-br from-indigo-700 to-purple-700 px-[5px] py-[7px] text-[8px] font-semibold text-white animate-ios-badge-pulse">
                {value > 99 ? "99+" : value}
            </span>
        );
    };

    const closeMenu = useCallback(() => {
        haptic('light');
        setIsMenuOpen(false);
        resetDragState();
    }, [resetDragState]);

    return (
        <div className="md:hidden">
            <div className="pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
                {children}
            </div>

            <Transition show={isMenuOpen} as={Fragment}>
                <div className="fixed inset-0 z-50" style={{ bottom: "calc(3.75rem + env(safe-area-inset-bottom))" }}>
                    <Transition.Child
                        as={Fragment}
                        enter="transition-opacity duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="transition-opacity duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <button
                            type="button"
                            aria-label="Close menu"
                            onClick={closeMenu}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />
                    </Transition.Child>

                    <Transition.Child
                        as={Fragment}
                        enter="transition-all duration-300"
                        enterFrom="translate-y-full opacity-0"
                        enterTo="translate-y-0 opacity-100"
                        leave="transition-all duration-200"
                        leaveFrom="translate-y-0 opacity-100"
                        leaveTo="translate-y-full opacity-0"
                    >
                        <div
                            ref={sheetRef}
                            className={cn(
                                "absolute bottom-0 left-0 right-0 rounded-t-3xl px-5 pt-3 pb-6",
                                "liquid-glass-sheet"
                            )}
                            style={{
                                transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
                                transition: isDragging ? 'none' : 'transform 0.3s var(--ease-ios-spring)',
                                animationTimingFunction: 'var(--ease-ios-spring)',
                            }}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                        >
                            {/* iOS-style drag indicator */}
                            <div className="flex justify-center pb-3">
                                <div className="h-1 w-10 rounded-full bg-white/30" />
                            </div>

                            <div className="flex items-center justify-between pb-3">
                                <div className="text-sm font-semibold text-slate-200">Quick Menu</div>
                                <button
                                    type="button"
                                    onClick={closeMenu}
                                    className="ios-pressable rounded-full border border-white/10 bg-white/10 p-2 text-slate-200"
                                    aria-label="Close menu"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div 
                                className="max-h-[75vh] space-y-4 overflow-y-scroll pr-1" 
                                style={{ 
                                    WebkitOverflowScrolling: 'touch',
                                    touchAction: 'pan-y'
                                }}
                            >
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Browse</div>
                                    <div className="mt-2 grid gap-1.5">
                                        {mainLinks.map((link) => {
                                            const Icon = link.icon;
                                            return (
                                                <PrefetchLink
                                                    key={link.href}
                                                    href={link.href}
                                                    onClick={closeMenu}
                                                    className={cn(
                                                        "ios-pressable flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                                                        link.isActive
                                                            ? "elevated-2 text-indigo-300"
                                                            : "text-slate-200 hover:bg-white/5"
                                                    )}
                                                >
                                                    {cloneElement(<Icon className="h-5 w-5" />)}
                                                    <span className="flex-1">{link.label}</span>
                                                    {link.badge && link.badge > 0 && (
                                                        <span className="rounded-full border border-indigo-500/50 bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
                                                            {link.badge}
                                                        </span>
                                                    )}
                                                </PrefetchLink>
                                            );
                                        })}
                                    </div>
                                </div>

                                {moreLinks.length > 0 && (
                                    <div className="border-t border-white/10 pt-4">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">More</div>
                                        <div className="mt-2 grid gap-1.5">
                                            {moreLinks.map((link) => {
                                                const Icon = link.icon;
                                                return (
                                                    <PrefetchLink
                                                        key={link.href}
                                                        href={link.href}
                                                        onClick={closeMenu}
                                                        className={cn(
                                                            "ios-pressable flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                                                            link.isActive
                                                                ? "elevated-2 text-indigo-300"
                                                                : "text-slate-200 hover:bg-white/5"
                                                        )}
                                                    >
                                                        {cloneElement(<Icon className="h-5 w-5" />)}
                                                        <span className="flex-1">{link.label}</span>
                                                        {link.badge && link.badge > 0 && (
                                                            <span className="rounded-full border border-rose-500/50 bg-rose-500/20 px-2 py-0.5 text-xs text-rose-100 animate-ios-badge-pulse">
                                                                {link.badge > 99 ? "99+" : link.badge}
                                                            </span>
                                                        )}
                                                    </PrefetchLink>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-white/10 pt-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">App</div>
                                    <div className="mt-2">
                                        <PWAInstallButton mobileMenu={true} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Transition.Child>
                </div>
            </Transition>

            <nav
                className="fixed bottom-0 left-0 right-0 z-40 liquid-glass-nav"
            >
                <div className="flex items-center justify-around px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
                    {mainLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = link.isActive && !isMenuOpen;
                        const isAnimating = activeTab === link.href;
                        return (
                            <PrefetchLink
                                key={link.href}
                                href={link.href}
                                onClick={() => handleTabPress(link.href)}
                                className={cn(
                                    "ios-tab-item relative flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium",
                                    isActive ? "text-white" : "text-slate-400"
                                )}
                            >
                                <Icon
                                    className={cn(
                                        "h-5 w-5 transition-all duration-200",
                                        isActive && "text-indigo-400",
                                        isAnimating && "animate-ios-icon-bounce"
                                    )}
                                />
                                <span className={cn(
                                    "transition-all duration-200",
                                    isActive && "font-semibold"
                                )}>
                                    {link.label}
                                </span>
                                {/* Active indicator dot */}
                                {isActive && (
                                    <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400" />
                                )}
                                {renderBadge(link.badge)}
                            </PrefetchLink>
                        );
                    })}
                    {needsMoreButton && (
                        <button
                            type="button"
                            onClick={handleMenuToggle}
                            className={cn(
                                "ios-tab-item flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium",
                                isMenuOpen ? "text-white" : "text-slate-400"
                            )}
                            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                            aria-expanded={isMenuOpen}
                        >
                            <span className={cn(
                                "transition-transform duration-200",
                                isMenuOpen && "rotate-90"
                            )}>
                                {isMenuOpen ? <X className="h-5 w-5 text-indigo-400" /> : <Ellipsis className="h-5 w-5" />}
                            </span>
                            <span className={cn(
                                "transition-all duration-200",
                                isMenuOpen && "font-semibold"
                            )}>
                                More
                            </span>
                            {/* Active indicator dot */}
                            {isMenuOpen && (
                                <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400" />
                            )}
                        </button>
                    )}
                </div>
            </nav>
        </div>
    );
}
