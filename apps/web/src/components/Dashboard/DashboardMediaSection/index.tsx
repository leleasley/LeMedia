"use client";

import { useEffect, useState, useRef } from "react";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAvailabilityStatusBatched } from "@/lib/availability-client";
import { MediaStatus, statusToMediaStatus } from "@/lib/media-status";

export interface MediaCard {
    id: number;
    title: string;
    posterUrl: string | null;
    year?: string;
    rating?: number;
    description?: string;
    type?: "movie" | "tv";
    statusBadge?: "available" | "partially_available";
    mediaStatus?: number;
}

interface DashboardMediaSectionProps {
    title: string;
    items: MediaCard[];
    viewAllHref?: string;
    className?: string;
    lazy?: boolean;
}

export function DashboardMediaSection({
    title,
    items,
    viewAllHref,
    className,
    lazy = false,
}: DashboardMediaSectionProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(!lazy);
    const [availability, setAvailability] = useState<Record<string, string>>({});
    const availabilityRef = useRef<Record<string, string>>({});

    useEffect(() => {
        if (!lazy) return;
        const node = containerRef.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
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
        availabilityRef.current = availability;
    }, [availability]);

    useEffect(() => {
        if (!isVisible || items.length === 0) return;

        const movieIds: number[] = [];
        const tvIds: number[] = [];

        for (const item of items) {
            const key = `${item.type}:${item.id}`;
            if (availabilityRef.current[key] === undefined) {
                if (item.type === "movie") movieIds.push(item.id);
                else if (item.type === "tv") tvIds.push(item.id);
            }
        }

        const fetchForType = (type: "movie" | "tv", ids: number[]) => {
            if (!ids.length) return;
            fetchAvailabilityStatusBatched(type, ids)
                .then((next) => {
                    if (!Object.keys(next).length) return;
                    const mapped: Record<string, string> = {};
                    for (const [id, value] of Object.entries(next)) {
                        mapped[`${type}:${id}`] = String(value);
                    }
                    setAvailability((prev) => ({ ...prev, ...mapped }));
                })
                .catch(() => { });
        };

        fetchForType("movie", movieIds);
        fetchForType("tv", tvIds);
    }, [isVisible, items]);

    if (!items.length) return null;

    // Show max 20 items per section on dashboard
    const displayItems = items.slice(0, 20);

    return (
        <div ref={containerRef} className={cn("space-y-4", className)}>
            <div className="flex items-center justify-between px-4 md:px-0">
                <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                    {title}
                </h2>
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

            {/* Grid layout matching Jellyseerr - same as network pages */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4 px-4 md:px-0">
                {displayItems.map((item, idx) => {
                    const key = `${item.type}:${item.id}`;
                    const status = availability[key];
                    const href = item.type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;

                    // Use shared utility for consistent status mapping
                    // Priority: item.mediaStatus from API > availability check > statusBadge
                    const finalMediaStatus: MediaStatus | undefined =
                        item.mediaStatus ??
                        statusToMediaStatus(status) ??
                        statusToMediaStatus(item.statusBadge);

                    return (
                        <HoverMediaCard
                            key={key}
                            id={item.id}
                            title={item.title}
                            posterUrl={item.posterUrl}
                            href={href}
                            year={item.year}
                            rating={item.rating}
                            description={item.description}
                            mediaType={item.type}
                            mediaStatus={finalMediaStatus}
                            imagePriority={!lazy || idx < 12}
                        />
                    );
                })}
            </div>
        </div>
    );
}
