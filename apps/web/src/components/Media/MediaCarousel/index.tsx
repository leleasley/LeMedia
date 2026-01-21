"use client";

import { useEffect, useRef, useState } from "react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import { cn } from "@/lib/utils";
import { fetchAvailabilityStatusBatched } from "@/lib/availability-client";
import { useWheelForHorizontalScroll } from "@/hooks/useWheelForHorizontalScroll";
import { availabilityToMediaStatus } from "@/lib/media-status";

export interface CarouselItem {
    id: number;
    title: string;
    posterUrl: string | null;
    year?: string;
    rating?: number;
    description?: string;
    type?: "movie" | "tv";
    genres?: string[];
    mediaStatus?: number;
}

interface MediaCarouselProps {
    title: string;
    items: CarouselItem[];
    itemType?: "movie" | "tv";
    viewAllHref?: string;
    className?: string;
    lazy?: boolean;
}

export function MediaCarousel({ title, items, itemType, viewAllHref, className, lazy = false }: MediaCarouselProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const handleWheel = useWheelForHorizontalScroll(scrollRef);
    const [isVisible, setIsVisible] = useState(!lazy);
    const [availabilityStatus, setAvailabilityStatus] = useState<Record<string, string>>({});
    const availabilityRef = useRef<Record<string, string>>({});

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
            // Re-check after animation
            setTimeout(checkScroll, 300);
        }
    };

    useEffect(() => {
        if (!lazy) return;
        const node = containerRef.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some(entry => entry.isIntersecting)) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "300px" }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [lazy]);

    useEffect(() => {
        if (!isVisible) return;
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
    }, [items.length, isVisible]);

    useEffect(() => {
        availabilityRef.current = availabilityStatus;
    }, [availabilityStatus]);

    useEffect(() => {
        if (!isVisible || items.length === 0) return;
        const types = new Set<string>();
        for (const item of items) {
            const t = item.type ?? itemType;
            if (t) types.add(t);
        }
        if (!types.size) return;

        const fetchForType = (type: "movie" | "tv", ids: number[]) => {
            if (!ids.length) return;
            fetchAvailabilityStatusBatched(type, ids)
                .then(next => {
                    if (!Object.keys(next).length) return;
                    const mapped: Record<string, string> = {};
                    for (const [id, value] of Object.entries(next)) {
                        mapped[`${type}:${id}`] = String(value);
                    }
                    setAvailabilityStatus(prev => ({ ...prev, ...mapped }));
                })
                .catch(() => { });
        };

        const movieIds: number[] = [];
        const tvIds: number[] = [];
        for (const item of items) {
            const t = item.type ?? itemType;
            if (t === "movie") {
                const key = `movie:${item.id}`;
                if (availabilityRef.current[key] === undefined) movieIds.push(item.id);
            } else if (t === "tv") {
                const key = `tv:${item.id}`;
                if (availabilityRef.current[key] === undefined) tvIds.push(item.id);
            }
        }

        fetchForType("movie", movieIds);
        fetchForType("tv", tvIds);
    }, [isVisible, items, itemType]);

    if (!items.length) return null;

    return (
        <div ref={containerRef} className={cn("space-y-4", className)}>
            <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">{title}</h2>
                {viewAllHref && (
                    <PrefetchLink
                        href={viewAllHref}
                        className="group flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
                    >
                        View all
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </PrefetchLink>
                )}
            </div>

            <div className="relative group/carousel">
                {/* Left Arrow */}
                <button
                    onClick={() => scroll("left")}
                    disabled={!canScrollLeft}
                    className={cn(
                        "absolute left-2 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full glass-strong transition-all duration-300 hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none",
                        canScrollLeft ? "opacity-0 group-hover/carousel:opacity-100" : "opacity-0"
                    )}
                    aria-label="Scroll left"
                >
                    <ChevronLeft className="h-6 w-6 text-foreground" />
                </button>

                {/* Scrollable Container */}
                <div
                    ref={scrollRef}
                    onScroll={() => {
                        if (rafRef.current !== null) return;
                        rafRef.current = requestAnimationFrame(() => {
                            rafRef.current = null;
                            checkScroll();
                        });
                    }}
                    onWheel={handleWheel}
                    className="flex gap-3 md:gap-5 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth py-4 -mx-3 px-3 md:mx-0 md:px-0"
                    aria-busy={!isVisible}
                >
                    {isVisible
                        ? items.map((item, idx) => (
                            <div key={item.id} className="flex-shrink-0 w-32 sm:w-36 md:w-40">
                                <HoverMediaCard
                                    id={item.id}
                                    title={item.title}
                                    posterUrl={item.posterUrl}
                                    year={item.year}
                                    rating={item.rating}
                                    description={item.description}
                                    href={item.type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`}
                                    genres={item.genres}
                                    mediaType={item.type ?? itemType}
                                    mediaStatus={
                                        item.mediaStatus ??
                                        availabilityToMediaStatus(availabilityStatus[`${item.type ?? itemType}:${item.id}`])
                                    }
                                    imagePriority={idx < 6}
                                    imageLoading={idx < 6 ? "eager" : "lazy"}
                                    imageFetchPriority={idx < 6 ? "high" : "auto"}
                                />
                            </div>
                        ))
                        : Array.from({ length: 6 }).map((_, idx) => (
                            <div key={`placeholder-${idx}`} className="flex-shrink-0 w-32 sm:w-36 md:w-40">
                                <div className="relative aspect-[2/3] w-full rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse" />
                            </div>
                        ))}

                    {/* View All Card (End of list) */}
                    {isVisible && viewAllHref && (
                        <div className="flex-shrink-0 w-32 sm:w-36 md:w-40 flex flex-col">
                            <PrefetchLink href={viewAllHref} className="flex-1">
                                <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden cursor-pointer glass-strong border border-white/10 group/viewall hover:ring-2 hover:ring-primary/50 transition-all">
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground group-hover/viewall:text-foreground transition-colors">
                                        <div className="p-3 rounded-full bg-white/5 group-hover/viewall:bg-white/10 transition-colors">
                                            <ArrowRight className="h-6 w-6" />
                                        </div>
                                        <span className="font-semibold text-sm">View All</span>
                                    </div>
                                </div>
                            </PrefetchLink>
                        </div>
                    )}
                </div>

                {/* Right Arrow */}
                <button
                    onClick={() => scroll("right")}
                    disabled={!canScrollRight}
                    className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full glass-strong transition-all duration-300 hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none",
                        canScrollRight ? "opacity-0 group-hover/carousel:opacity-100" : "opacity-0"
                    )}
                    aria-label="Scroll right"
                >
                    <ChevronRight className="h-6 w-6 text-foreground" />
                </button>
            </div>
        </div>
    );
}
