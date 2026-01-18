"use client";

import { Fragment, useMemo, useState, cloneElement } from "react";
import { AlertTriangle, CalendarDays, Clock, Ellipsis, Film, Search, Settings, Sparkles, Tv, Users, X } from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Transition } from "@headlessui/react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { PWAInstallButton } from "@/components/PWA/InstallButton";

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
    const pathname = usePathname();

    // Lock body scroll when mobile menu is open
    useLockBodyScroll(isMenuOpen);

    const isMediaPage = useMemo(() => {
        const current = pathname ?? "";
        return current.startsWith("/movie/") || current.startsWith("/tv/") || current.startsWith("/person/");
    }, [pathname]);

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
            <span className="absolute left-4 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-md border border-indigo-600 bg-gradient-to-br from-indigo-700 to-purple-700 px-[5px] py-[7px] text-[8px] font-semibold text-white">
                {value > 99 ? "99+" : value}
            </span>
        );
    };

    const closeMenu = () => setIsMenuOpen(false);

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
                        enter="transition-all duration-200 ease-out"
                        enterFrom="translate-y-full opacity-0"
                        enterTo="translate-y-0 opacity-100"
                        leave="transition-all duration-150 ease-in"
                        leaveFrom="translate-y-0 opacity-100"
                        leaveTo="translate-y-full opacity-0"
                    >
                        <div
                            className={cn(
                                "absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-slate-700 px-5 pt-5 pb-6 shadow-2xl",
                                isMediaPage ? "media-page-gradient bg-slate-900/90" : "bg-slate-900/95"
                            )}
                        >
                            <div className="flex items-center justify-between pb-3">
                                <div className="text-sm font-semibold text-slate-200">Quick Menu</div>
                                <button
                                    type="button"
                                    onClick={closeMenu}
                                    className="rounded-full border border-slate-700 bg-slate-800/80 p-2 text-slate-200"
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
                                    <div className="mt-2 grid gap-2">
                                        {mainLinks.map((link) => {
                                            const Icon = link.icon;
                                            return (
                                                <PrefetchLink
                                                    key={link.href}
                                                    href={link.href}
                                                    onClick={closeMenu}
                                                    className={cn(
                                                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                                                        link.isActive ? "bg-slate-800 text-indigo-300" : "text-slate-200"
                                                    )}
                                                >
                                                    {cloneElement(<Icon className="h-5 w-5" />)}
                                                    <span className="flex-1">{link.label}</span>
                                                    {link.badge && link.badge > 0 && (
                                                        <span className="rounded-md border border-indigo-500 bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
                                                            {link.badge}
                                                        </span>
                                                    )}
                                                </PrefetchLink>
                                            );
                                        })}
                                    </div>
                                </div>

                                {moreLinks.length > 0 && (
                                    <div className="border-t border-slate-800 pt-4">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">More</div>
                                        <div className="mt-2 grid gap-2">
                                    {moreLinks.map((link) => {
                                        const Icon = link.icon;
                                        return (
                                            <PrefetchLink
                                                key={link.href}
                                                href={link.href}
                                                        onClick={closeMenu}
                                                        className={cn(
                                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                                                            link.isActive ? "bg-slate-800 text-indigo-300" : "text-slate-200"
                                                        )}
                                                    >
                                                    {cloneElement(<Icon className="h-5 w-5" />)}
                                                    <span className="flex-1">{link.label}</span>
                                                    {link.badge && link.badge > 0 && (
                                                        <span className="rounded-md border border-rose-500 bg-rose-500/20 px-2 py-0.5 text-xs text-rose-100">
                                                            {link.badge > 99 ? "99+" : link.badge}
                                                        </span>
                                                    )}
                                                </PrefetchLink>
                                            );
                                        })}
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-slate-800 pt-4">
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
                className={cn(
                    "fixed bottom-0 left-0 right-0 z-40 border-t border-white/10",
                    isMediaPage ? "bg-slate-900/85" : "bg-slate-900/95"
                )}
                style={{
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)"
                }}
            >
                <div className="flex items-center justify-around px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
                    {mainLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = link.isActive && !isMenuOpen;
                        return (
                            <PrefetchLink
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "relative flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors",
                                    isActive ? "text-white" : "text-slate-400"
                                )}
                            >
                                <Icon className={cn("h-5 w-5", isActive && "text-indigo-400")} />
                                <span>{link.label}</span>
                                {renderBadge(link.badge)}
                            </PrefetchLink>
                        );
                    })}
                    {needsMoreButton && (
                        <button
                            type="button"
                            onClick={() => setIsMenuOpen(prev => !prev)}
                            className={cn(
                                "flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors",
                                isMenuOpen ? "text-white" : "text-slate-400"
                            )}
                            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                            aria-expanded={isMenuOpen}
                        >
                            {isMenuOpen ? <X className={cn("h-5 w-5", "text-indigo-400")} /> : <Ellipsis className="h-5 w-5" />}
                            <span>More</span>
                        </button>
                    )}
                </div>
            </nav>
        </div>
    );
}
