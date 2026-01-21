"use client";

import { useEffect, useState, useRef } from "react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWheelForHorizontalScroll } from "@/hooks/useWheelForHorizontalScroll";
import { getAvatarAlt, getAvatarSrc } from "@/lib/avatar";

interface RecentRequest {
    id: string;
    tmdbId: number;
    title: string;
    year?: string;
    backdrop: string | null;
    poster: string | null;
    type: "movie" | "tv";
    status: string;
    username: string;
    avatarUrl?: string | null;
    jellyfinUserId?: string | null;
}

interface RecentRequestsSliderProps {
    items: RecentRequest[];
    className?: string;
    isLoading?: boolean;
}

const statusClasses: Record<string, { bg: string; text: string; border: string }> = {
    available: { bg: "bg-green-500", text: "text-green-100", border: "border-green-500/50" },
    partially_available: { bg: "bg-purple-500", text: "text-purple-100", border: "border-purple-500/50" },
    downloading: { bg: "bg-amber-500", text: "text-amber-100", border: "border-amber-500/50" },
    submitted: { bg: "bg-blue-500", text: "text-blue-100", border: "border-blue-500/50" },
    pending: { bg: "bg-sky-500", text: "text-sky-100", border: "border-sky-500/50" },
    denied: { bg: "bg-red-500", text: "text-red-100", border: "border-red-500/50" },
    failed: { bg: "bg-red-500", text: "text-red-100", border: "border-red-500/50" },
    removed: { bg: "bg-slate-500", text: "text-slate-100", border: "border-slate-500/50" },
    already_exists: { bg: "bg-violet-500", text: "text-violet-100", border: "border-violet-500/50" }
};

function formatStatusLabel(status: string) {
    return status.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

export function RecentRequestsSlider({ items, className, isLoading = false }: RecentRequestsSliderProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const handleWheel = useWheelForHorizontalScroll(scrollRef);

    const checkScroll = () => {
        if (scrollRef.current) {
            setCanScrollLeft(scrollRef.current.scrollLeft > 0);
            setCanScrollRight(
                scrollRef.current.scrollLeft < scrollRef.current.scrollWidth - scrollRef.current.clientWidth - 10
            );
        } else {
            setCanScrollLeft(false);
            setCanScrollRight(false);
        }
    };

    const scroll = (direction: "left" | "right") => {
        if (scrollRef.current) {
            const scrollAmount = window.innerWidth > 768 ? 800 : 300;
            scrollRef.current.scrollBy({
                left: direction === "left" ? -scrollAmount : scrollAmount,
                behavior: "smooth",
            });
            setTimeout(checkScroll, 300);
        }
    };

    useEffect(() => {
        checkScroll();
        const handleResize = () => checkScroll();
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [items.length]);

    if (!items.length && isLoading) {
        return (
            <div ref={containerRef} className={cn("space-y-4", className)}>
                <div className="flex items-center justify-between">
                    <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Recent Requests</h2>
                    <div className="h-4 w-16 rounded bg-white/10 animate-pulse" />
                </div>
                <div className="flex gap-3 md:gap-5 overflow-hidden pb-4 -mx-3 px-3 md:mx-0 md:px-0">
                    {Array.from({ length: 3 }).map((_, idx) => (
                        <div
                            key={`recent-request-skeleton-${idx}`}
                            className="h-40 sm:h-44 w-72 sm:w-96 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse flex-shrink-0"
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (!items.length) return null;

    const getStatusClasses = (status: string) => {
        return statusClasses[status] || { bg: "bg-gray-500", text: "text-gray-100", border: "border-gray-500/50" };
    };

    return (
        <div ref={containerRef} className={cn("space-y-4", className)}>
            <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Recent Requests</h2>
                <PrefetchLink
                    href="/requests"
                    className="group flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
                >
                    View all
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </PrefetchLink>
            </div>

            <div className="relative group/carousel">
                {canScrollLeft && (
                    <button
                        onClick={() => scroll("left")}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 text-white p-2 rounded-full transition-colors"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                )}

                <div
                    ref={scrollRef}
                    className="flex gap-3 md:gap-5 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mx-3 px-3 md:mx-0 md:px-0"
                    onScroll={() => {
                        if (rafRef.current !== null) return;
                        rafRef.current = requestAnimationFrame(() => {
                            rafRef.current = null;
                            checkScroll();
                        });
                    }}
                    onWheel={handleWheel}
                >
                    {items.map((request) => {
                        const statusInfo = getStatusClasses(request.status);
                        const href = request.type === "movie" ? `/movie/${request.tmdbId}` : `/tv/${request.tmdbId}`;
                        const avatarSrc = getAvatarSrc({ avatarUrl: request.avatarUrl, jellyfinUserId: request.jellyfinUserId, username: request.username });
                        const avatarAlt = getAvatarAlt({ username: request.username });

                        return (
                            <PrefetchLink
                                key={request.id}
                                href={href}
                                className="flex-shrink-0"
                            >
                                {/* EXACT Jellyseerr RequestCard layout */}
                                <div className="relative overflow-hidden rounded-xl bg-gray-800 bg-cover bg-center text-gray-400 shadow ring-1 ring-gray-700 w-72 sm:w-96 h-40 sm:h-44">
                                    {/* Backdrop as full background */}
                                    <div className="absolute inset-0 z-0">
                                        {request.backdrop && (
                                            <Image
                                                src={request.backdrop}
                                                alt={request.title}
                                                fill
                                                className="object-cover"
                                                sizes="(min-width: 640px) 384px, 288px"
                                            />
                                        )}
                                        {/* Jellyseerr exact gradient */}
                                        <div
                                            className="absolute inset-0"
                                            style={{
                                                backgroundImage: 'linear-gradient(135deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 75%)',
                                            }}
                                        />
                                    </div>

                                    {/* Content container */}
                                    <div className="relative z-10 flex h-full items-center p-4">
                                        {/* Left: title and info */}
                                        <div className="flex min-w-0 flex-1 flex-col justify-center pr-4">
                                            {/* Year */}
                                            {request.year && (
                                                <div className="text-xs font-medium text-white mb-1">
                                                    {request.year}
                                                </div>
                                            )}
                                            
                                            {/* Title */}
                                            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold text-white mb-2">
                                                {request.title}
                                            </div>

                                            {/* User */}
                                            <div className="flex items-center gap-2 mb-2 text-sm">
                                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white overflow-hidden">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={avatarSrc}
                                                        alt={avatarAlt}
                                                        className="h-full w-full object-cover"
                                                        loading="lazy"
                                                        decoding="async"
                                                    />
                                                </span>
                                                <span className="text-gray-300 truncate">{request.username}</span>
                                            </div>

                                            {/* Status */}
                                            <div className="flex items-center">
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                                                    statusInfo.bg,
                                                    statusInfo.text
                                                )}>
                                                    {formatStatusLabel(request.status)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Right: poster thumbnail */}
                                        {request.poster && (
                                            <div className="flex-shrink-0 w-20 sm:w-24 transform-gpu overflow-hidden rounded-md shadow-md transition duration-300 hover:scale-105">
                                                <Image
                                                    src={request.poster}
                                                    alt={request.title}
                                                    width={96}
                                                    height={144}
                                                    className="object-cover"
                                                    sizes="(min-width: 640px) 96px, 80px"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </PrefetchLink>
                        );
                    })}
                </div>

                {canScrollRight && (
                    <button
                        onClick={() => scroll("right")}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 text-white p-2 rounded-full transition-colors"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                )}
            </div>
        </div>
    );
}
