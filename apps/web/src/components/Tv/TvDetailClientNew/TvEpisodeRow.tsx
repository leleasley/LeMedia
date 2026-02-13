"use client";

import React, { memo } from "react";
import { Check, CheckCircle, Info, Loader2, Star, Tv } from "lucide-react";
import { Episode } from "./types";
import CachedImage from "@/components/Common/CachedImage";
import { tmdbImageUrl } from "@/lib/tmdb-images";

interface TvEpisodeRowProps {
    episode: Episode;
    seasonNumber: number;
    isChecked: boolean;
    onToggle: (seasonNumber: number, episodeNumber: number, episode: Episode) => void;
    getAiringBadge: (dateStr: string) => string | null;
    formatDate: (dateStr: string) => string;
    formatRating: (rating: number) => string;
    imageProxyEnabled: boolean;
}

export const TvEpisodeRow = memo(({
    episode,
    seasonNumber,
    isChecked,
    onToggle,
    getAiringBadge,
    formatDate,
    formatRating,
    imageProxyEnabled
}: TvEpisodeRowProps) => {
    const stillUrl = tmdbImageUrl(episode.still_path, "w300", imageProxyEnabled);
    const airBadge = getAiringBadge(episode.air_date);
    const isRequested = episode.requested ?? false;
    const isAvailable = episode.available ?? false;
    const isDownloading = episode.downloading ?? episode.requestStatus === "downloading";
    const isDisabled = isRequested || isAvailable || isDownloading;

    return (
        <label
            className={`relative flex gap-3 sm:gap-5 py-3 sm:py-5 transition-colors ${isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-white/5"
                } ${isChecked ? "bg-purple-500/10" : ""}`}
        >
            <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(seasonNumber, episode.episode_number, episode)}
                className="hidden"
                disabled={isDisabled}
            />
            <div className={`mt-1 h-5 w-5 rounded border flex items-center justify-center transition-colors ${isAvailable ? "bg-green-500/20 border-green-400" :
                    isDisabled ? "bg-gray-700 border-gray-600" :
                        isChecked ? "bg-purple-500 border-purple-500" : "border-gray-500"
                }`}>
                {isAvailable ? (
                    <Check className="h-4 w-4 text-green-200" />
                ) : (isChecked || isDisabled) ? (
                    <CheckCircle className="h-4 w-4 text-white" />
                ) : null}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h4 className={`text-base font-semibold leading-snug ${isChecked ? "text-purple-100" : "text-gray-100"}`}>
                        {episode.episode_number} - {episode.name || "Untitled"}
                    </h4>
                    {isAvailable && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 border border-green-500/40 px-2.5 py-0.5 text-xs font-semibold text-green-300">
                            <CheckCircle className="h-3 w-3" />
                            Available
                        </span>
                    )}
                    {isDownloading && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Downloading
                        </span>
                    )}
                    {isRequested && !isAvailable && !isDownloading && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 border border-blue-500/40 px-2.5 py-0.5 text-xs font-semibold text-blue-300">
                            <Info className="h-3 w-3" />
                            Already requested
                        </span>
                    )}
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-gray-200">
                        {formatDate(episode.air_date)}
                    </span>
                    {airBadge && (
                        <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-gray-200">
                            {airBadge}
                        </span>
                    )}
                    {episode.vote_average > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-400">
                            <Star className="h-3 w-3 fill-current" />
                            {formatRating(episode.vote_average)}
                        </span>
                    )}
                </div>
                <p className="mt-2 text-sm text-gray-400 leading-relaxed line-clamp-3">
                    {episode.overview || "No overview available."}
                </p>
            </div>
            <div className="hidden sm:block w-28 sm:w-44 h-16 sm:h-24 relative rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0">
                {stillUrl ? (
                    <CachedImage type="tmdb" src={stillUrl} alt={episode.name} fill className="object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Tv className="h-6 w-6 text-gray-600" />
                    </div>
                )}
                {isChecked && (
                    <div className="absolute inset-0 bg-purple-500/20" />
                )}
            </div>
        </label>
    );
});

TvEpisodeRow.displayName = "TvEpisodeRow";
