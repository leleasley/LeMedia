"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film } from "lucide-react";
import { useEffect, useState } from "react";
import { StarIcon, ArrowDownTrayIcon, HeartIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid, HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { useIsTouch } from "@/hooks/useIsTouch";
import { StatusBadgeMini } from "@/components/Common/StatusBadgeMini";
import { RequestMediaModal } from "@/components/Requests/RequestMediaModal";
import { SeriesRequestModal } from "@/components/Requests/SeriesRequestModal";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import CachedImage from "@/components/Common/CachedImage";
import { MediaStatus } from "@/components/Common/StatusBadgeMini";

export interface HoverMediaCardProps {
    id: number;
    image?: string;
    title: string;
    posterUrl: string | null;
    href: string;
    year?: string;
    rating?: number;
    description?: string;
    className?: string;
    genres?: string[];
    mediaType?: "movie" | "tv";
    mediaStatus?: MediaStatus;
    inProgress?: boolean;
    imagePriority?: boolean;
    imageLoading?: "eager" | "lazy";
    imageFetchPriority?: "high" | "auto" | "low";
    touchInteraction?: "expand" | "navigate";
    stableHover?: boolean;
    cardMode?: "requestable" | "library" | "libraryPartialRequest";
}

export function HoverMediaCard(props: HoverMediaCardProps) {
    const isTouch = useIsTouch();
    const router = useRouter();
    const toast = useToast();
    const linkUrl = props.href || (props.mediaType === "movie" ? `/movie/${props.id}` : `/tv/${props.id}`);
    const finalImage = props.image || props.posterUrl;
    const finalScore = props.rating;
    const mode = props.cardMode ?? "requestable";
    const canRequestByStatus =
        !props.mediaStatus ||
        props.mediaStatus === MediaStatus.UNKNOWN ||
        props.mediaStatus === MediaStatus.DELETED ||
        props.mediaStatus === MediaStatus.PARTIALLY_AVAILABLE;
    const showRequestAction =
        (mode === "requestable" && canRequestByStatus) ||
        (mode === "libraryPartialRequest" && props.mediaStatus === MediaStatus.PARTIALLY_AVAILABLE);
    const descriptionLines = showRequestAction ? 2 : 3;
    const displayYear = props.year ? props.year.slice(0, 4) : "";

    const [favorite, setFavorite] = useState(false);
    const [watchlist, setWatchlist] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [saving, setSaving] = useState(false);
    const [requestModalOpen, setRequestModalOpen] = useState(false);

    useEffect(() => {
        let active = true;
        const mediaType = props.mediaType ?? "movie";
        fetch(`/api/v1/media-list?tmdbId=${props.id}&mediaType=${mediaType}`, { credentials: "include" })
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (!active || !data) return;
                setFavorite(Boolean(data.favorite));
                setWatchlist(Boolean(data.watchlist));
            })
            .catch(() => { });
        return () => {
            active = false;
        };
    }, [props.id, props.mediaType]);

    const shouldFetchProfiles = requestModalOpen && showRequestAction && props.mediaType;
    const { data: profileData, isLoading: profilesLoading } = useSWR<{
        qualityProfiles: { id: number; name: string }[];
        defaultQualityProfileId: number;
        requestsBlocked: boolean;
        isAdmin?: boolean;
        prowlarrEnabled?: boolean;
        monitoringOption?: string;
        radarrMovie?: { id?: number | null } | null;
        existingSeries?: { id?: number | null } | null;
    }>(
        shouldFetchProfiles
            ? `/api/v1/${props.mediaType === "movie" ? "radarr/movie-info" : "sonarr/tv-info"}?tmdbId=${props.id}`
            : null,
        { revalidateOnFocus: false, dedupingInterval: 0 }
    );

    const toggle = async (e: React.MouseEvent, listType: "favorite" | "watchlist") => {
        e.preventDefault();
        e.stopPropagation();
        if (saving) return;
        setSaving(true);
        const mediaType = props.mediaType ?? "movie";
        const isActive = listType === "favorite" ? favorite : watchlist;
        const method = isActive ? "DELETE" : "POST";
        try {
            const res = await csrfFetch("/api/v1/media-list", {
                method,
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ listType, mediaType, tmdbId: props.id })
            });
            if (!res.ok) throw new Error("Request failed");
            if (listType === "favorite") {
                setFavorite(!isActive);
                toast.success(!isActive ? "Added to your favorites" : "Removed from your favorites", { timeoutMs: 3000 });
            }
            if (listType === "watchlist") {
                setWatchlist(!isActive);
                toast.success(!isActive ? "Added to your watchlist" : "Removed from your watchlist", { timeoutMs: 3000 });
            }
        } catch {
            toast.error("Failed to update list", { timeoutMs: 3000 });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={cn("relative group h-full", props.className)}>
            <div
                className={`relative h-full cursor-pointer overflow-hidden rounded-lg sm:rounded-2xl bg-gray-900 outline-none ring-1 transition-all duration-300 ${
                    props.stableHover
                        ? (showDetail ? "shadow-xl ring-white/20 z-10" : "shadow-md ring-white/5 hover:ring-white/15")
                        : (showDetail
                            ? "transform-gpu will-change-transform scale-[1.03] shadow-2xl ring-white/20 z-10"
                            : "transform-gpu will-change-transform scale-100 shadow-md ring-white/5 hover:ring-white/15")
                }`}
                style={{ paddingBottom: "150%" }}
                onMouseEnter={() => {
                    if (!isTouch) {
                        setShowDetail(true);
                    }
                }}
                onMouseLeave={() => setShowDetail(false)}
                onClick={() => {
                    if (isTouch && props.touchInteraction === "navigate") {
                        router.push(linkUrl);
                        return;
                    }
                    setShowDetail(true);
                }}
                role="link"
                tabIndex={0}
            >
                <div className="absolute inset-0 h-full w-full">
                    {finalImage ? (
                        <CachedImage
                            type="tmdb"
                            src={finalImage}
                            alt={props.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 33vw, (max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                            priority={props.imagePriority}
                            loading={props.imageLoading}
                            fetchPriority={props.imageFetchPriority}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gray-800">
                            <Film className="h-8 w-8 sm:h-12 sm:w-12 text-gray-700" />
                        </div>
                    )}

                    <div className="absolute top-0 left-0 right-0 p-1.5 sm:p-2 flex justify-between items-start z-20 pointer-events-none">
                        <div className="flex flex-col items-start gap-1">
                            <div className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-semibold uppercase tracking-wide backdrop-blur-sm ${
                                (props.mediaType ?? "movie") === "movie"
                                    ? "bg-blue-500/80 text-white"
                                    : "bg-violet-500/80 text-white"
                                }`}>
                                {(props.mediaType ?? "movie") === "movie" ? "Movie" : "Series"}
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 sm:gap-1.5 pointer-events-auto">
                            {props.mediaStatus && props.mediaStatus !== MediaStatus.UNKNOWN && (
                                <StatusBadgeMini status={props.mediaStatus} inProgress={props.inProgress} shrink />
                            )}

                            {showDetail && (
                                <div className="flex flex-col gap-1 sm:gap-1.5 animate-in fade-in zoom-in duration-200">
                                    <button
                                        type="button"
                                        onClick={(e) => toggle(e, "favorite")}
                                        disabled={saving}
                                        className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-pink-500 hover:bg-black/80 transition-colors shadow-lg border border-white/10"
                                        aria-label="Toggle favorite"
                                    >
                                        {favorite ? <HeartIconSolid className="h-3 w-3 sm:h-4 sm:w-4" /> : <HeartIcon className="h-3 w-3 sm:h-4 sm:w-4" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => toggle(e, "watchlist")}
                                        disabled={saving}
                                        className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-amber-400 hover:bg-black/80 transition-colors shadow-lg border border-white/10"
                                        aria-label="Toggle watchlist"
                                    >
                                        {watchlist ? <StarIconSolid className="h-3 w-3 sm:h-4 sm:w-4" /> : <StarIcon className="h-3 w-3 sm:h-4 sm:w-4" />}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={`absolute inset-0 transition-opacity duration-300 ${showDetail ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
                        <Link href={linkUrl} className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-900/90 to-transparent">
                            <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 pb-2.5 sm:pb-4">
                                <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                                    {displayYear && (
                                        <div className="text-[10px] sm:text-xs font-medium text-gray-300">{displayYear}</div>
                                    )}

                                    {finalScore !== undefined && finalScore > 0 && (
                                        <div className="flex items-center text-[10px] sm:text-xs font-bold text-yellow-400">
                                            <span>{Math.round(finalScore * 10)}%</span>
                                        </div>
                                    )}
                                </div>

                                <h3 className="text-xs sm:text-base font-bold text-white leading-tight mb-1 sm:mb-2 line-clamp-2">
                                    {props.title}
                                </h3>
                                {props.description ? (
                                    <p
                                        className="text-[10px] sm:text-xs text-gray-300 leading-snug mb-1"
                                        style={{
                                            WebkitLineClamp: descriptionLines,
                                            display: "-webkit-box",
                                            overflow: "hidden",
                                            WebkitBoxOrient: "vertical",
                                            wordBreak: "break-word"
                                        }}
                                    >
                                        {props.description}
                                    </p>
                                ) : null}

                                {showRequestAction && (
                                    <div className="mt-1 sm:mt-2">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setRequestModalOpen(true);
                                            }}
                                            className="flex w-full items-center justify-center gap-1 sm:gap-1.5 rounded-md sm:rounded-lg bg-indigo-600 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 active:scale-95"
                                        >
                                            <ArrowDownTrayIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            Request
                                        </button>
                                    </div>
                                )}
                            </div>
                        </Link>
                    </div>
                </div>
            </div>

            {showRequestAction && requestModalOpen && (props.mediaType ?? "movie") === "tv" && (
                <SeriesRequestModal
                    open={requestModalOpen}
                    onClose={() => setRequestModalOpen(false)}
                    tmdbId={props.id}
                    qualityProfiles={profileData?.qualityProfiles ?? []}
                    defaultQualityProfileId={profileData?.defaultQualityProfileId ?? 1}
                    requestsBlocked={profileData?.requestsBlocked ?? false}
                    title={props.title}
                    posterUrl={finalImage ?? undefined}
                    backdropUrl={finalImage ?? undefined}
                    isLoading={profilesLoading}
                    isAdmin={Boolean(profileData?.isAdmin)}
                    prowlarrEnabled={Boolean(profileData?.prowlarrEnabled)}
                    serviceItemId={profileData?.existingSeries?.id ?? null}
                    defaultMonitoringOption={profileData?.monitoringOption ?? "all"}
                />
            )}
            {showRequestAction && requestModalOpen && (props.mediaType ?? "movie") === "movie" && (
                <RequestMediaModal
                    open={requestModalOpen}
                    onClose={() => setRequestModalOpen(false)}
                    tmdbId={props.id}
                    mediaType={props.mediaType ?? "movie"}
                    qualityProfiles={profileData?.qualityProfiles ?? []}
                    defaultQualityProfileId={profileData?.defaultQualityProfileId ?? 1}
                    requestsBlocked={profileData?.requestsBlocked ?? false}
                    title={props.title}
                    year={displayYear}
                    posterUrl={finalImage ?? undefined}
                    backdropUrl={finalImage ?? undefined}
                    isLoading={profilesLoading}
                    isAdmin={Boolean(profileData?.isAdmin)}
                    prowlarrEnabled={Boolean(profileData?.prowlarrEnabled)}
                    allowRaw={false}
                    serviceItemId={profileData?.radarrMovie?.id ?? null}
                />
            )}
        </div>
    );
}
