"use client";

import React, { memo } from "react";
import { CheckCircle, ChevronDown, ChevronUp, Tv } from "lucide-react";
import { Season, Episode } from "./types";
import { TvEpisodeRow } from "./TvEpisodeRow";
import CachedImage from "@/components/Common/CachedImage";
import { tmdbImageUrl } from "@/lib/tmdb-images";

interface TvSeasonItemProps {
    season: Season;
    isExpanded: boolean;
    isLoading: boolean;
    episodes: Episode[];
    checkedEpisodes: Set<number>;
    availabilityCounts?: { available: number; total: number };
    requestCounts?: { requested: number };
    onToggleSeason: (seasonNumber: number) => void;
    onToggleAllInSeason: (seasonNumber: number) => void;
    onToggleEpisode: (seasonNumber: number, episodeNumber: number, episode: Episode) => void;
    onRequestEpisodes: (seasonNumber: number) => void;
    monitorEpisodes: boolean;
    onToggleMonitorEpisodes: (checked: boolean) => void;
    hasQualityProfiles: boolean;
    isSubmitting: boolean;
    getAiringBadge: (dateStr: string) => string | null;
    formatDate: (dateStr: string) => string;
    formatRating: (rating: number) => string;
    imageProxyEnabled: boolean;
}

export const TvSeasonItem = memo(({
    season,
    isExpanded,
    isLoading,
    episodes,
    checkedEpisodes,
    availabilityCounts,
    requestCounts,
    onToggleSeason,
    onToggleAllInSeason,
    onToggleEpisode,
    onRequestEpisodes,
    monitorEpisodes,
    onToggleMonitorEpisodes,
    hasQualityProfiles,
    isSubmitting,
    getAiringBadge,
    formatDate,
    formatRating,
    imageProxyEnabled
}: TvSeasonItemProps) => {
    const checkedCount = checkedEpisodes.size;
    const selectableCount = episodes.filter(e => !e.requested && !e.available).length;
    const allChecked = selectableCount > 0 && checkedCount === selectableCount;

    const seasonAvailableCount = availabilityCounts?.available ?? 0;
    const seasonTotalCount = availabilityCounts?.total ?? season.episode_count;
    const isSeasonFullyAvailable = seasonAvailableCount > 0 && seasonAvailableCount >= seasonTotalCount;
    const isSeasonPartiallyAvailable = seasonAvailableCount > 0 && seasonAvailableCount < seasonTotalCount;
    const requestedCount = requestCounts?.requested ?? 0;
    const isSeasonRequested = requestedCount > 0 && !isSeasonFullyAvailable;

    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20 backdrop-blur-sm transition-all hover:bg-black/30">
            <button onClick={() => onToggleSeason(season.season_number)} className="w-full flex items-center justify-between p-3 sm:p-6 transition-colors">
                <div className="flex items-center gap-6">
                    {season.poster_path ? (
                        <div className="h-16 w-12 rounded bg-neutral-800 flex-shrink-0 relative overflow-hidden hidden sm:block">
                            <CachedImage
                                type="tmdb"
                                src={tmdbImageUrl(season.poster_path, "w200", imageProxyEnabled) ?? ""}
                                alt=""
                                fill
                                className="object-cover"
                            />
                        </div>
                    ) : (
                        <div className="h-16 w-12 rounded bg-white/5 flex-shrink-0 hidden sm:flex items-center justify-center">
                            <Tv className="h-5 w-5 text-gray-500" />
                        </div>
                    )}
                    <div className="text-left">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg font-bold text-white">{season.name || `Season ${season.season_number}`}</span>
                            {isSeasonFullyAvailable && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 border border-green-500/40 px-2.5 py-0.5 text-xs font-semibold text-green-300">
                                    <CheckCircle className="h-3 w-3" />
                                    Available
                                </span>
                            )}
                            {isSeasonPartiallyAvailable && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 border border-purple-500/40 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
                                    <CheckCircle className="h-3 w-3" />
                                    Partial
                                </span>
                            )}
                            {isSeasonRequested && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 border border-sky-500/40 px-2.5 py-0.5 text-xs font-semibold text-sky-200">
                                    <CheckCircle className="h-3 w-3" />
                                    Submitted
                                </span>
                            )}
                        </div>
                        <div className="text-sm text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                            <span>{season.episode_count} Episodes</span>
                            {availabilityCounts && seasonAvailableCount > 0 && (
                                <span className={`font-medium px-2 py-0.5 rounded text-xs ${isSeasonFullyAvailable
                                        ? "text-green-400 bg-green-400/10"
                                        : "text-purple-400 bg-purple-400/10"
                                    }`}>
                                    {seasonAvailableCount}/{seasonTotalCount} Available
                                </span>
                            )}
                            {requestedCount > 0 && (
                                <span className="font-medium px-2 py-0.5 rounded text-xs text-sky-300 bg-sky-400/10">
                                    {requestedCount}/{seasonTotalCount} Requested
                                </span>
                            )}
                            {checkedCount > 0 && (
                                <span className="text-emerald-400 font-medium bg-emerald-400/10 px-2 py-0.5 rounded text-xs">{checkedCount} Selected</span>
                            )}
                        </div>
                    </div>
                </div>
                {isExpanded ? (<ChevronUp className="h-5 w-5 text-gray-400" />) : (<ChevronDown className="h-5 w-5 text-gray-400" />)}
            </button>
            {isExpanded && (
                <div className="border-t border-white/10 bg-black/20 p-3 sm:p-6 animate-in slide-in-from-top-2 duration-200">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                            <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                            Loading episodes...
                        </div>
                    ) : episodes.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">No episodes found</div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-white/5">
                                <div className="flex flex-col gap-3">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${allChecked ? 'bg-white border-white' : 'border-gray-500 group-hover:border-white'}`}>
                                            {allChecked && <CheckCircle className="h-3.5 w-3.5 text-black" />}
                                        </div>
                                        <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Select All Episodes</span>
                                        <input type="checkbox" checked={allChecked} onChange={() => onToggleAllInSeason(season.season_number)} className="hidden" />
                                    </label>
                                    {checkedCount > 0 && (
                                        <label className="flex items-center gap-3 cursor-pointer group ml-8">
                                            <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${monitorEpisodes ? 'bg-purple-500 border-purple-500' : 'border-gray-500 group-hover:border-purple-400'}`}>
                                                {monitorEpisodes && <CheckCircle className="h-3 w-3 text-white" />}
                                            </div>
                                            <span className="text-xs font-medium text-gray-400 group-hover:text-gray-300 transition-colors">Monitor episodes after request</span>
                                            <input type="checkbox" checked={monitorEpisodes} onChange={(e) => onToggleMonitorEpisodes(e.target.checked)} className="hidden" />
                                        </label>
                                    )}
                                </div>
                                {checkedCount > 0 && (
                                    <button
                                        onClick={() => onRequestEpisodes(season.season_number)}
                                        className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={!hasQualityProfiles || isSubmitting}
                                    >
                                        Request {checkedCount} Episode{checkedCount !== 1 ? 's' : ''}
                                    </button>
                                )}
                            </div>
                            <div className="divide-y divide-white/10">
                                {episodes.map((episode) => (
                                    <TvEpisodeRow
                                        key={episode.episode_number}
                                        episode={episode}
                                        seasonNumber={season.season_number}
                                        isChecked={checkedEpisodes.has(episode.episode_number)}
                                        onToggle={onToggleEpisode}
                                        getAiringBadge={getAiringBadge}
                                        formatDate={formatDate}
                                        formatRating={formatRating}
                                        imageProxyEnabled={imageProxyEnabled}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
});

TvSeasonItem.displayName = "TvSeasonItem";
