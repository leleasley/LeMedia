"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import Image from "next/image";
import { Activity, TrendingUp, Film, Tv, Clock, Sparkles, Heart, ArrowRight, Play, X, Calendar, Flame, Trophy, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then(res => res.json());

type ContinueWatchingItem = {
  id: string;
  name: string;
  type: string;
  tmdbId: number | null;
  mediaType: "movie" | "tv" | null;
  posterPath: string | null;
  backdropPath: string | null;
  playedPercentage: number;
  seriesName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  year?: number;
  runTimeTicks?: number;
};

type WatchStats = {
  totalMoviesWatched: number;
  totalEpisodesWatched: number;
  totalSeriesWatched: number;
  totalHoursWatched: number;
  totalDaysWatched: number;
  moviesThisWeek: number;
  episodesThisWeek: number;
  favoriteGenres: Array<{ name: string; count: number }>;
};

type RecommendationItem = {
  id: string;
  name: string;
  type: string;
  tmdbId: number | null;
  mediaType: "movie" | "tv" | null;
  posterPath: string | null;
  backdropPath: string | null;
  year?: number;
};

type WatchHistoryMovie = {
  id: string;
  name: string;
  tmdbId: number | null;
  year: number | null;
  lastPlayed: string;
  playCount: number;
};

type WatchHistorySeries = {
  id: string;
  name: string;
  tmdbId: number | null;
  year: number | null;
  lastPlayed: string;
  episodesWatched: number;
};

type RecentlyWatchedItem = {
  id: string;
  name: string;
  type: string;
  seriesName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  year?: number;
  lastPlayed: string;
  tmdbId: number | null;
};

type ThisMonthStats = {
  moviesThisMonth: number;
  episodesThisMonth: number;
  hoursThisMonth: number;
  moviesLastMonth: number;
  episodesLastMonth: number;
  hoursLastMonth: number;
};

type Achievement = {
  hoursThisWeek: number;
  level: "casual" | "watcher" | "binge" | "marathon" | "legendary";
  nextMilestone: number;
  progress: number;
};

type NextToWatchItem = {
  id: string;
  name: string;
  type: string;
  tmdbId: number | null;
  mediaType: "movie" | "tv" | null;
  posterPath: string | null;
  playedPercentage: number;
};


function StatCard({ icon: Icon, label, value, subtext, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color: string;
}) {
  return (
    <div className="glass-strong rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all hover:scale-[1.02] group">
      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          "p-3 rounded-xl",
          color === "blue" && "bg-blue-500/10 text-blue-400",
          color === "purple" && "bg-purple-500/10 text-purple-400",
          color === "emerald" && "bg-emerald-500/10 text-emerald-400",
          color === "amber" && "bg-amber-500/10 text-amber-400",
          color === "rose" && "bg-rose-500/10 text-rose-400",
          color === "indigo" && "bg-indigo-500/10 text-indigo-400"
        )}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-3xl font-bold text-white">{value}</div>
        <div className="text-sm text-gray-400">{label}</div>
        {subtext && (
          <div className="text-xs text-gray-500 pt-1">{subtext}</div>
        )}
      </div>
    </div>
  );
}

function ContinueWatchingCard({ item }: { item: ContinueWatchingItem }) {
  const displayName = item.type === "Episode" && item.seriesName 
    ? item.seriesName 
    : item.name;
  
  const subtitle = item.type === "Episode" && item.seasonNumber && item.episodeNumber
    ? `S${item.seasonNumber}E${item.episodeNumber} • ${item.name}`
    : item.year ? `${item.year}` : "";

  const href = item.tmdbId && item.mediaType ? `/${item.mediaType}/${item.tmdbId}` : "#";

  return (
    <PrefetchLink
      href={href}
      className="group block rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all hover:scale-[1.02] relative"
    >
      <div className="relative aspect-[2/3]">
        {item.posterPath ? (
          <Image
            src={item.posterPath}
            alt={displayName}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 33vw, 20vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
            {item.type === "Movie" ? (
              <Film className="h-12 w-12 text-gray-600" />
            ) : (
              <Tv className="h-12 w-12 text-gray-600" />
            )}
          </div>
        )}
        
        {/* Progress bar */}
        {item.playedPercentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/50">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${Math.min(item.playedPercentage, 100)}%` }}
            />
          </div>
        )}

        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="rounded-full bg-white/20 backdrop-blur-sm p-4">
            <Play className="h-8 w-8 text-white fill-white" />
          </div>
        </div>

        {/* Percentage badge */}
        {item.playedPercentage > 0 && (
          <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-semibold text-white">
            {Math.round(item.playedPercentage)}%
          </div>
        )}
      </div>
      
      <div className="p-3 space-y-1">
        <div className="text-sm font-semibold text-white line-clamp-1">
          {displayName}
        </div>
        {subtitle && (
          <div className="text-xs text-gray-400 line-clamp-1">
            {subtitle}
          </div>
        )}
      </div>
    </PrefetchLink>
  );
}

function RecommendationCard({ item }: { item: RecommendationItem }) {
  const href = item.tmdbId && item.mediaType ? `/${item.mediaType}/${item.tmdbId}` : "#";

  return (
    <PrefetchLink
      href={href}
      className="group block rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all hover:scale-[1.02]"
    >
      <div className="relative aspect-[2/3]">
        {item.posterPath ? (
          <Image
            src={item.posterPath}
            alt={item.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 33vw, 15vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
            {item.type === "Movie" ? (
              <Film className="h-12 w-12 text-gray-600" />
            ) : (
              <Tv className="h-12 w-12 text-gray-600" />
            )}
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-full group-hover:translate-y-0 transition-transform">
          <div className="text-sm font-semibold text-white line-clamp-2">
            {item.name}
          </div>
          {item.year && (
            <div className="text-xs text-gray-300 mt-1">
              {item.year}
            </div>
          )}
        </div>
      </div>
    </PrefetchLink>
  );
}

// Modal for showing watch history
function WatchHistoryModal({ 
  type, 
  onClose 
}: { 
  type: "movies" | "series"; 
  onClose: () => void;
}) {
  const { data, error } = useSWR<{ items: Array<WatchHistoryMovie | WatchHistorySeries> }>(
    `/api/v1/my-activity/watch-history/${type}`,
    fetcher
  );

  const items = data?.items ?? [];
  const isLoading = !data && !error;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="glass-strong rounded-3xl border border-white/10 w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {type === "movies" ? (
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                <Film className="h-6 w-6" />
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
                <Tv className="h-6 w-6" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-white">
                {type === "movies" ? "Movie Watch History" : "Series Watch History"}
              </h2>
              <p className="text-sm text-gray-400">
                {isLoading ? "Loading..." : `${items.length} ${type === "movies" ? "films" : "shows"} watched`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="mx-auto w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 animate-pulse">
                <Activity className="h-6 w-6 text-indigo-400" />
              </div>
              <p className="text-gray-400">Loading watch history...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No {type === "movies" ? "movies" : "series"} watched yet</p>
            </div>
          ) : (
            items.map((item) => {
              const isMovie = "playCount" in item;
              const href = item.tmdbId && type === "movies" ? `/movie/${item.tmdbId}` : 
                           item.tmdbId && type === "series" ? `/tv/${item.tmdbId}` : "#";
              
              return (
                <PrefetchLink
                  key={item.id}
                  href={href}
                  className="block glass-strong rounded-xl p-4 border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-white truncate">
                          {item.name}
                        </h3>
                        {item.year && (
                          <span className="text-sm text-gray-500">({item.year})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {new Date(item.lastPlayed).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric"
                            })}
                          </span>
                        </div>
                        {isMovie ? (
                          <span className="text-gray-500">• Watched {(item as WatchHistoryMovie).playCount}x</span>
                        ) : (
                          <span className="text-gray-500">• {(item as WatchHistorySeries).episodesWatched} episodes</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-500 group-hover:text-white transition-colors flex-shrink-0 ml-3" />
                  </div>
                </PrefetchLink>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Achievement Badge Component
function AchievementBadge({ achievement, onClick }: { achievement: Achievement; onClick?: () => void }) {
  const achievements = {
    casual: { name: "Casual Watcher", emoji: "👀", color: "from-blue-500/20 to-cyan-500/20", borderColor: "border-blue-400/50", icon: Trophy },
    watcher: { name: "Film Enthusiast", emoji: "🎬", color: "from-purple-500/20 to-pink-500/20", borderColor: "border-purple-400/50", icon: Trophy },
    binge: { name: "Binge Master", emoji: "🔥", color: "from-orange-500/20 to-red-500/20", borderColor: "border-orange-400/50", icon: Flame },
    marathon: { name: "Media Marathon", emoji: "🏃", color: "from-red-500/20 to-rose-500/20", borderColor: "border-red-400/50", icon: Trophy },
    legendary: { name: "Legendary Viewer", emoji: "👑", color: "from-yellow-500/20 to-amber-500/20", borderColor: "border-yellow-400/50", icon: Trophy }
  };

  const ach = achievements[achievement.level];
  const progressPercent = (achievement.progress / achievement.nextMilestone) * 100;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "glass-strong rounded-2xl p-6 border transition-all hover:scale-[1.02] text-left w-full group",
        ach.borderColor,
        onClick ? "hover:border-white/40 cursor-pointer" : "cursor-default"
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          "p-3 rounded-xl bg-gradient-to-br",
          ach.color
        )}>
          <ach.icon className="h-6 w-6 text-yellow-400" />
        </div>
        <span className="text-3xl">{ach.emoji}</span>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-2xl font-bold text-white">{achievement.hoursThisWeek}h</div>
          <div className="text-sm text-gray-400">{ach.name}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Progress to next</span>
            <span className="text-gray-300">{achievement.progress}/{achievement.nextMilestone}h</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {onClick && (
          <div className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
            Click to view all achievements →
          </div>
        )}
      </div>
    </button>
  );
}

// Achievements Modal
function AchievementsModal({ achievement, onClose }: { achievement: Achievement; onClose: () => void }) {
  const tiers = [
    { key: "casual", name: "Casual Watcher", emoji: "👀", hours: 5, color: "from-blue-500/20 to-cyan-500/20", border: "border-blue-400/40" },
    { key: "watcher", name: "Film Enthusiast", emoji: "🎬", hours: 10, color: "from-purple-500/20 to-pink-500/20", border: "border-purple-400/40" },
    { key: "binge", name: "Binge Master", emoji: "🔥", hours: 25, color: "from-orange-500/20 to-red-500/20", border: "border-orange-400/40" },
    { key: "marathon", name: "Media Marathon", emoji: "🏃", hours: 50, color: "from-red-500/20 to-rose-500/20", border: "border-red-400/40" },
    { key: "legendary", name: "Legendary Viewer", emoji: "👑", hours: 100, color: "from-yellow-500/20 to-amber-500/20", border: "border-yellow-400/40" }
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-3xl border border-white/10 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Achievements</h2>
            <p className="text-sm text-gray-400">Weekly progress based on hours watched</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="glass-strong rounded-2xl p-4 border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-400">This week</div>
                <div className="text-2xl font-bold text-white">{achievement.hoursThisWeek} hours</div>
              </div>
              <div className="text-sm text-gray-400">Next milestone: {achievement.nextMilestone}h</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tiers.map((tier) => {
              const unlocked = achievement.hoursThisWeek >= tier.hours;
              const progress = Math.min((achievement.hoursThisWeek / tier.hours) * 100, 100);

              return (
                <div
                  key={tier.key}
                  className={cn(
                    "rounded-2xl p-4 border bg-gradient-to-br transition-all",
                    tier.color,
                    unlocked ? tier.border : "border-white/10"
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{tier.name}</div>
                      <div className="text-xs text-gray-300">{tier.hours} hours / week</div>
                    </div>
                    <div className="text-2xl">{tier.emoji}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          unlocked ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-indigo-500 to-purple-500"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={unlocked ? "text-emerald-300" : "text-gray-400"}>
                        {unlocked ? "Unlocked" : `${Math.max(tier.hours - achievement.hoursThisWeek, 0)}h to unlock`}
                      </span>
                      <span className="text-gray-400">{Math.min(achievement.hoursThisWeek, tier.hours)}/{tier.hours}h</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Recently Watched Timeline Component
function RecentlyWatchedTimeline({ items }: { items: RecentlyWatchedItem[] }) {
  const groupedByDate: Record<string, RecentlyWatchedItem[]> = {};
  
  for (const item of items) {
    const date = new Date(item.lastPlayed).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    if (!groupedByDate[date]) {
      groupedByDate[date] = [];
    }
    groupedByDate[date].push(item);
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedByDate).map(([date, dateItems]) => (
        <div key={date} className="space-y-3">
          <div className="flex items-center gap-3 px-1">
            <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/50" />
            <span className="text-sm font-semibold text-gray-300">{date}</span>
            <span className="text-xs text-gray-500 bg-white/10 px-2 py-0.5 rounded-full">
              {dateItems.length} {dateItems.length === 1 ? "item" : "items"}
            </span>
          </div>
          
          <div className="space-y-2 ml-1.5 pl-4 border-l-2 border-indigo-500/30">
            {dateItems.map((item) => {
              const displayName = item.type === "Episode" && item.seriesName
                ? item.seriesName
                : item.name;
              const episodeInfo = item.type === "Episode" && item.seasonNumber && item.episodeNumber
                ? `S${item.seasonNumber}E${item.episodeNumber}`
                : null;
              
              // Build the link - for episodes, link to the series
              const mediaType = item.type === "Movie" ? "movie" : "tv";
              const href = item.tmdbId ? `/${mediaType}/${item.tmdbId}` : "#";

              return (
                <PrefetchLink
                  key={item.id}
                  href={href}
                  className="block py-3 px-4 glass-strong rounded-xl border border-white/10 hover:border-indigo-400/50 hover:bg-white/5 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {item.type === "Movie" ? (
                          <div className="p-1.5 rounded-lg bg-blue-500/20">
                            <Film className="h-3.5 w-3.5 text-blue-400" />
                          </div>
                        ) : (
                          <div className="p-1.5 rounded-lg bg-purple-500/20">
                            <Tv className="h-3.5 w-3.5 text-purple-400" />
                          </div>
                        )}
                        <span className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                          {displayName}
                        </span>
                        {item.year && (
                          <span className="text-xs text-gray-500 flex-shrink-0">({item.year})</span>
                        )}
                      </div>
                      {episodeInfo && item.name && (
                        <div className="text-xs text-gray-400 pl-8">
                          {episodeInfo} • {item.name}
                        </div>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
                  </div>
                </PrefetchLink>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// This Month Stats Component
function ThisMonthStatsCard({ stats }: { stats: ThisMonthStats }) {
  const moviesTrend = stats.moviesThisMonth - stats.moviesLastMonth;
  const episodesTrend = stats.episodesThisMonth - stats.episodesLastMonth;
  const hoursTrend = stats.hoursThisMonth - stats.hoursLastMonth;

  const TrendIcon = ({ value }: { value: number }) => {
    if (value > 0) return <ArrowRight className="h-4 w-4 text-emerald-400 rotate-45" />;
    if (value < 0) return <ArrowRight className="h-4 w-4 text-rose-400 -rotate-45" />;
    return <ArrowRight className="h-4 w-4 text-gray-500" />;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="glass-strong rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-blue-400" />
            <span className="text-sm text-gray-400">Movies</span>
          </div>
          <TrendIcon value={moviesTrend} />
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold text-white">{stats.moviesThisMonth}</div>
          <span className="text-xs text-gray-500">
            {moviesTrend > 0 ? "+" : ""}{moviesTrend} vs last month
          </span>
        </div>
      </div>

      <div className="glass-strong rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Tv className="h-5 w-5 text-purple-400" />
            <span className="text-sm text-gray-400">Episodes</span>
          </div>
          <TrendIcon value={episodesTrend} />
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold text-white">{stats.episodesThisMonth}</div>
          <span className="text-xs text-gray-500">
            {episodesTrend > 0 ? "+" : ""}{episodesTrend} vs last month
          </span>
        </div>
      </div>

      <div className="glass-strong rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-emerald-400" />
            <span className="text-sm text-gray-400">Hours</span>
          </div>
          <TrendIcon value={hoursTrend} />
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold text-white">{stats.hoursThisMonth}h</div>
          <span className="text-xs text-gray-500">
            {hoursTrend > 0 ? "+" : ""}{hoursTrend}h vs last month
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MyActivityPage() {
  const [showMovieHistory, setShowMovieHistory] = useState(false);
  const [showSeriesHistory, setShowSeriesHistory] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);

  const { data: continueWatchingData, error: cwError } = useSWR<{ items: ContinueWatchingItem[] }>(
    "/api/v1/my-activity/continue-watching",
    fetcher,
    { refreshInterval: 120000 } // Refresh every 2 minutes
  );

  const { data: statsData, error: statsError } = useSWR<WatchStats>(
    "/api/v1/my-activity/stats",
    fetcher,
    { refreshInterval: 300000 } // Refresh every 5 minutes
  );

  const { data: recommendationsData, error: recsError } = useSWR<{ items: RecommendationItem[] }>(
    "/api/v1/my-activity/recommendations",
    fetcher,
    { refreshInterval: 600000 } // Refresh every 10 minutes
  );

  const { data: thisMonthData, error: monthError } = useSWR<ThisMonthStats>(
    "/api/v1/my-activity/this-month",
    fetcher,
    { refreshInterval: 600000 } // Refresh every 10 minutes
  );

  const { data: achievementData, error: achievementError } = useSWR<Achievement>(
    "/api/v1/my-activity/achievements",
    fetcher,
    { refreshInterval: 600000 } // Refresh every 10 minutes
  );

  const { data: recentlyWatchedData, error: recentError } = useSWR<{ items: RecentlyWatchedItem[] }>(
    "/api/v1/my-activity/recently-watched",
    fetcher,
    { refreshInterval: 120000 } // Refresh every 2 minutes
  );

  const { data: nextToWatchData, error: nextError } = useSWR<{ items: NextToWatchItem[] }>(
    "/api/v1/my-activity/next-to-watch",
    fetcher,
    { refreshInterval: 120000 } // Refresh every 2 minutes
  );

  const continueWatching = continueWatchingData?.items ?? [];
  const stats = statsData ?? {
    totalMoviesWatched: 0,
    totalEpisodesWatched: 0,
    totalSeriesWatched: 0,
    totalHoursWatched: 0,
    totalDaysWatched: 0,
    moviesThisWeek: 0,
    episodesThisWeek: 0,
    favoriteGenres: []
  };
  const recommendations = recommendationsData?.items ?? [];
  const thisMonth = thisMonthData ?? {
    moviesThisMonth: 0,
    episodesThisMonth: 0,
    hoursThisMonth: 0,
    moviesLastMonth: 0,
    episodesLastMonth: 0,
    hoursLastMonth: 0
  };
  const achievement = achievementData ?? {
    hoursThisWeek: 0,
    level: "casual",
    nextMilestone: 10,
    progress: 0
  };
  const recentlyWatched = recentlyWatchedData?.items ?? [];
  const nextToWatch = nextToWatchData?.items ?? [];

  const isLoading = !continueWatchingData && !cwError;

  return (
    <div className="space-y-10 pb-12">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl glass-strong border border-white/10 p-8 lg:p-10">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-400/30 shadow-lg shadow-indigo-500/20">
              <Activity className="h-8 w-8 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">My Activity</h1>
              <p className="text-gray-400 text-sm lg:text-base mt-1">Track your watch journey and discover new content</p>
            </div>
          </div>
          
          {/* Quick stats summary */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <Film className="h-4 w-4 text-blue-400" />
              <span><span className="text-white font-semibold">{stats.totalMoviesWatched}</span> films</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Tv className="h-4 w-4 text-purple-400" />
              <span><span className="text-white font-semibold">{stats.totalSeriesWatched}</span> series</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Clock className="h-4 w-4 text-emerald-400" />
              <span><span className="text-white font-semibold">{stats.totalHoursWatched}</span>h total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Watch Statistics</h2>
        </div>
        
        {/* Main Stats - Bigger cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <button
            onClick={() => setShowMovieHistory(true)}
            className="glass-strong rounded-2xl p-6 border border-white/10 hover:border-blue-400/50 transition-all hover:scale-[1.02] group text-left cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <Film className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
              </div>
              <div className="space-y-1">
                <div className="text-4xl font-bold text-white">{stats.totalMoviesWatched}</div>
                <div className="text-base text-gray-400">Films Watched</div>
                <div className="text-xs text-blue-400/70 pt-1">View full history →</div>
              </div>
            </div>
          </button>
          
          <button
            onClick={() => setShowSeriesHistory(true)}
            className="glass-strong rounded-2xl p-6 border border-white/10 hover:border-purple-400/50 transition-all hover:scale-[1.02] group text-left cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                  <Tv className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
              </div>
              <div className="space-y-1">
                <div className="text-4xl font-bold text-white">{stats.totalSeriesWatched}</div>
                <div className="text-base text-gray-400">Series Watched</div>
                <div className="text-xs text-purple-400/70 pt-1">View full history →</div>
              </div>
            </div>
          </button>
          
          <div className="glass-strong rounded-2xl p-6 border border-white/10 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Clock className="h-6 w-6" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-4xl font-bold text-white">{stats.totalHoursWatched}</div>
                <div className="text-base text-gray-400">Hours Watched</div>
                <div className="text-xs text-emerald-400/70 pt-1">{stats.totalDaysWatched} days of content</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Secondary Stats - Smaller cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <StatCard
            icon={Film}
            label="This Week"
            value={stats.moviesThisWeek}
            subtext="Movies"
            color="amber"
          />
          <StatCard
            icon={Tv}
            label="This Week"
            value={stats.episodesThisWeek}
            subtext="Episodes"
            color="rose"
          />
          <StatCard
            icon={Tv}
            label="Total Episodes"
            value={stats.totalEpisodesWatched}
            subtext="All episodes"
            color="indigo"
          />
          <StatCard
            icon={Heart}
            label="Top Genre"
            value={stats.favoriteGenres[0]?.name ?? "—"}
            subtext={stats.favoriteGenres[0]?.count ? `${stats.favoriteGenres[0].count} items` : undefined}
            color="rose"
          />
        </div>
      </div>

      {/* Two Column Layout for Achievement and This Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Achievement Badge */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Trophy className="h-5 w-5 text-yellow-400" />
            </div>
            <h2 className="text-xl font-bold text-white">This Week's Achievement</h2>
          </div>
          <AchievementBadge achievement={achievement} onClick={() => setShowAchievements(true)} />
        </div>

        {/* Favorite Genres */}
        {stats.favoriteGenres.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <Heart className="h-5 w-5 text-rose-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Your Top Genres</h2>
            </div>
            <div className="glass-strong rounded-2xl p-6 border border-white/10 h-[calc(100%-3rem)]">
              <div className="flex flex-wrap gap-3">
                {stats.favoriteGenres.map((genre, index) => {
                  const colors = [
                    "from-rose-500/20 to-pink-500/20 border-rose-400/30 text-rose-300",
                    "from-purple-500/20 to-indigo-500/20 border-purple-400/30 text-purple-300",
                    "from-blue-500/20 to-cyan-500/20 border-blue-400/30 text-blue-300",
                    "from-emerald-500/20 to-teal-500/20 border-emerald-400/30 text-emerald-300",
                    "from-amber-500/20 to-orange-500/20 border-amber-400/30 text-amber-300"
                  ];
                  const colorClass = colors[index % colors.length];
                  
                  return (
                    <div
                      key={genre.name}
                      className={cn(
                        "rounded-xl px-4 py-2.5 border bg-gradient-to-r transition-all hover:scale-105",
                        colorClass
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold opacity-60">#{index + 1}</span>
                        <span className="text-sm font-semibold">{genre.name}</span>
                        <span className="text-xs opacity-60">
                          {genre.count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* This Month Stats */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white">This Month vs Last Month</h2>
        </div>
        <ThisMonthStatsCard stats={thisMonth} />
      </div>

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Play className="h-5 w-5 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Continue Watching</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {continueWatching.map((item) => (
              <ContinueWatchingCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Next to Watch */}
      {nextToWatch.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Flame className="h-5 w-5 text-orange-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Next to Watch</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {nextToWatch.map((item) => {
              const href = item.tmdbId && item.mediaType ? `/${item.mediaType}/${item.tmdbId}` : "#";
              return (
                <PrefetchLink
                  key={item.id}
                  href={href}
                  className="group block rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:border-orange-400/50 transition-all hover:scale-[1.02] relative"
                >
                  <div className="relative aspect-[2/3]">
                    {item.posterPath ? (
                      <Image
                        src={item.posterPath}
                        alt={item.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 768px) 33vw, 20vw"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                        {item.mediaType === "movie" ? (
                          <Film className="h-12 w-12 text-gray-600" />
                        ) : (
                          <Tv className="h-12 w-12 text-gray-600" />
                        )}
                      </div>
                    )}
                    
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <Play className="h-8 w-8 text-white" />
                    </div>
                    
                    {/* Progress bar if partially watched */}
                    {item.playedPercentage > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/50">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full"
                          style={{ width: `${item.playedPercentage}%` }}
                        />
                      </div>
                    )}
                  </div>
                </PrefetchLink>
              );
            })}
          </div>
        </div>
      )}

      {/* Recently Watched Timeline */}
      {recentlyWatched.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Clock className="h-5 w-5 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Recently Watched</h2>
            <span className="text-xs text-gray-500 bg-white/10 px-2 py-1 rounded-full ml-2">
              {recentlyWatched.length} items
            </span>
          </div>
          <div className="glass-strong rounded-2xl p-6 border border-white/10 max-h-[600px] overflow-y-auto">
            <RecentlyWatchedTimeline items={recentlyWatched} />
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Sparkles className="h-5 w-5 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Recommended For You</h2>
            <span className="text-xs text-gray-500 bg-white/10 px-2 py-1 rounded-full ml-2">
              Powered by TMDB + Jellyfin
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {recommendations.map((item) => (
              <RecommendationCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && continueWatching.length === 0 && recommendations.length === 0 && (
        <div className="glass-strong rounded-3xl p-12 text-center border border-white/10">
          <div className="mx-auto w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
            <Activity className="h-10 w-10 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Start Watching</h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Your watch history and recommendations will appear here once you start watching content.
          </p>
          <PrefetchLink
            href="/"
            className="inline-flex items-center gap-2 btn btn-primary"
          >
            Browse Content
            <ArrowRight className="h-4 w-4" />
          </PrefetchLink>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="glass-strong rounded-3xl p-12 text-center border border-white/10">
          <div className="mx-auto w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 animate-pulse">
            <Activity className="h-10 w-10 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Loading Your Activity...</h3>
          <p className="text-gray-400">Fetching your watch history from Jellyfin</p>
        </div>
      )}

      {/* Modals */}
      {showMovieHistory && <WatchHistoryModal type="movies" onClose={() => setShowMovieHistory(false)} />}
      {showSeriesHistory && <WatchHistoryModal type="series" onClose={() => setShowSeriesHistory(false)} />}
      {showAchievements && <AchievementsModal achievement={achievement} onClose={() => setShowAchievements(false)} />}
    </div>
  );
}
