"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import {
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
  Clock,
  Compass,
  Download,
  Film,
  Flame,
  Heart,
  Layers,
  Library,
  Loader2,
  Play,
  Sparkles,
  Star,
  TrendingUp,
  Tv,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { cn } from "@/lib/utils";
import { MediaStatus, statusToMediaStatus } from "@/lib/media-status";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";

// ─── Types ───

type RecentRequestItem = {
  id: string;
  tmdbId: number;
  title: string;
  year?: string;
  poster: string | null;
  backdrop: string | null;
  type: "movie" | "tv";
  status: string;
  username: string;
};

type RecentAddedItem = {
  id: number;
  title: string;
  posterUrl: string | null;
  year?: string;
  type?: "movie" | "tv";
  mediaStatus?: number;
};

type ContinueWatchingItem = {
  id: string;
  title: string;
  posterUrl: string | null;
  playUrl: string;
  progress: number;
  type: "movie" | "episode" | "tv";
};

type ServiceHealth = {
  name: string;
  type: string;
  ok: boolean;
};

type WatchStats = {
  totalMoviesWatched: number;
  totalEpisodesWatched: number;
  totalSeriesWatched: number;
  totalHoursWatched: number;
  moviesThisWeek: number;
  episodesThisWeek: number;
  favoriteGenres: Array<{ name: string; count: number }>;
};

type AchievementLevel = {
  hoursThisWeek: number;
  level: "casual" | "watcher" | "binge" | "marathon" | "legendary";
  nextMilestone: number;
  progress: number;
};

type UpcomingEpisode = {
  seriesId: number;
  seriesName: string;
  seriesPoster: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  airDate: string;
  daysUntil: number;
};

type PersonalizedRecommendation = {
  id: string;
  name: string;
  type: string;
  tmdbId: number | null;
  mediaType: "movie" | "tv" | null;
  posterPath: string | null;
  backdropPath: string | null;
  year?: number;
  source: "jellyfin" | "tmdb";
  reasoning?: string; // Why this was recommended
};

type FriendActivity = {
  id: string;
  type: string;
  userId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  metadata: any;
  createdAt: string;
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Late night";
}

// ─── Subcomponents ───

function HeroShortcut({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <PrefetchLink
      href={href}
      className="group flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-lg hover:shadow-black/20"
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400 transition-colors group-hover:text-white" />
        {label}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
    </PrefetchLink>
  );
}

function ServicePill({ name, type, ok }: ServiceHealth) {
  const typeIcons: Record<string, string> = {
    database: "DB",
    radarr: "R",
    sonarr: "S",
    prowlarr: "P",
    sabnzbd: "SAB",
    qbittorrent: "qB",
    nzbget: "NZB",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        ok
          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-400/20"
          : "bg-rose-500/10 text-rose-300 border border-rose-400/20"
      )}
      title={`${name}: ${ok ? "Connected" : "Unreachable"}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-rose-400")} />
      {typeIcons[type] ?? name.slice(0, 3)}
    </span>
  );
}

// ─── Main Component ───

type Props = {
  isAdmin: boolean;
  username: string;
  displayName: string | null;
};

export default function HomeDashboardClient({ isAdmin, username, displayName }: Props) {
  // Data fetching
  const { data: recentRequestsData, error: recentRequestsError, isLoading: recentRequestsLoading } = useSWR<{ items: RecentRequestItem[] }>(
    "/api/v1/requests/recent?take=10",
    { refreshInterval: 20000, revalidateOnFocus: true }
  );

  const { data: recentAddedData, error: recentAddedError, isLoading: recentAddedLoading } = useSWR<{ items: RecentAddedItem[] }>(
    "/api/v1/library/recent?take=36",
    { refreshInterval: 60000, revalidateOnFocus: true }
  );

  const { data: continueWatchingData } = useSWR<{ items: ContinueWatchingItem[] }>(
    "/api/v1/library/continue-watching?take=8",
    { refreshInterval: 60000, revalidateOnFocus: true }
  );

  const { data: healthData } = useSWR<{ services: ServiceHealth[] }>(
    "/api/v1/services/health",
    { refreshInterval: 120000, revalidateOnFocus: false }
  );

  // NEW: Personal dashboard data
  const { data: watchStatsData } = useSWR<WatchStats>(
    "/api/v1/my-activity/stats",
    { refreshInterval: 300000, revalidateOnFocus: false } // 5 min cache
  );

  const { data: achievementData } = useSWR<AchievementLevel>(
    "/api/v1/my-activity/achievements",
    { refreshInterval: 300000, revalidateOnFocus: false }
  );

  const { data: upcomingEpisodesData } = useSWR<{ items: UpcomingEpisode[] }>(
    "/api/v1/my-activity/upcoming-episodes",
    { refreshInterval: 3600000, revalidateOnFocus: false } // 1 hour cache
  );

  const { data: personalizedRecsData } = useSWR<{ items: PersonalizedRecommendation[] }>(
    "/api/v1/my-activity/recommendations",
    { refreshInterval: 3600000, revalidateOnFocus: false }
  );

  const { data: friendsActivityData } = useSWR<{ events: FriendActivity[] }>(
    "/api/v1/social/feed?type=friends&limit=5",
    { refreshInterval: 60000, revalidateOnFocus: true }
  );

  const [greeting, setGreeting] = useState(() => getGreeting());
  const [nowLine, setNowLine] = useState(() => 
    new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
  );
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "ready" | "active">("all");
  const [requestPageByFilter, setRequestPageByFilter] = useState<Record<string, number>>({});
  const [recentAddedPageRaw, setRecentAddedPage] = useState(0);

  const requestPageRaw = requestPageByFilter[requestFilter] ?? 0;
  const setRequestPage = (page: number) => {
    setRequestPageByFilter(prev => ({ ...prev, [requestFilter]: page }));
  };

  const recentRequests = useMemo(() => recentRequestsData?.items ?? [], [recentRequestsData]);
  const recentAdded = useMemo(() => recentAddedData?.items ?? [], [recentAddedData]);
  const continueWatching = useMemo(() => continueWatchingData?.items ?? [], [continueWatchingData]);
  const services = useMemo(() => healthData?.services ?? [], [healthData]);
  
  // NEW: Derived data for personal widgets with defensive array checks
  const watchStats = watchStatsData || null;
  const achievement = achievementData || null;
  const upcomingEpisodes = useMemo(() => {
    const items = upcomingEpisodesData?.items;
    return Array.isArray(items) ? items : [];
  }, [upcomingEpisodesData]);
  
  const personalizedRecs = useMemo(() => {
    const items = personalizedRecsData?.items;
    return Array.isArray(items) ? items : [];
  }, [personalizedRecsData]);
  
  const friendsActivity = useMemo(() => {
    const events = friendsActivityData?.events;
    return Array.isArray(events) ? events : [];
  }, [friendsActivityData]);

  // Derived stats
  const requestStats = recentRequests.reduce(
    (acc, item) => {
      const v = item.status.toLowerCase();
      acc.total += 1;
      if (["available", "completed"].includes(v)) acc.available += 1;
      else if (["partially_available"].includes(v)) acc.partial += 1;
      else if (["pending", "queued", "submitted"].includes(v)) acc.pending += 1;
      else if (["downloading", "processing"].includes(v)) acc.processing += 1;
      else if (["denied", "failed", "removed"].includes(v)) acc.failed += 1;
      return acc;
    },
    { total: 0, available: 0, partial: 0, pending: 0, processing: 0, failed: 0 }
  );

  const filteredRequests = recentRequests.filter((item) => {
    const value = item.status.toLowerCase();
    if (requestFilter === "pending") return ["pending", "queued", "submitted"].includes(value);
    if (requestFilter === "ready") return ["available", "completed"].includes(value);
    if (requestFilter === "active") return ["downloading", "processing"].includes(value);
    return true;
  });
  const requestsPerPage = 6;
  const requestsPageCount = Math.max(1, Math.ceil(filteredRequests.length / requestsPerPage));
  const requestPage = Math.min(requestPageRaw, requestsPageCount - 1);
  const pagedRequests = useMemo(
    () => filteredRequests.slice(requestPage * requestsPerPage, (requestPage + 1) * requestsPerPage),
    [filteredRequests, requestPage]
  );
  const recentAddedPerPage = 12;
  const recentAddedPageCount = Math.max(1, Math.ceil(recentAdded.length / recentAddedPerPage));
  const recentAddedPage = Math.min(recentAddedPageRaw, recentAddedPageCount - 1);
  const pagedRecentAdded = useMemo(
    () => recentAdded.slice(recentAddedPage * recentAddedPerPage, (recentAddedPage + 1) * recentAddedPerPage),
    [recentAdded, recentAddedPage]
  );

  const name = displayName || username;

  return (
    <div className="space-y-6">
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0c1629] via-[#0f1a33] to-[#0b1425] shadow-2xl shadow-black/40">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-sky-500/[0.07] blur-3xl" />
          <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-indigo-500/[0.07] blur-3xl" />
          <div className="absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-purple-500/[0.05] blur-3xl" />
        </div>

        <div className="relative p-5 md:p-6">
          <div className="space-y-4">
            {/* Top row: date + services + stats */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-slate-400">{nowLine}</p>
                {services.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {services.map((svc) => (
                      <ServicePill key={svc.name} {...svc} />
                    ))}
                  </div>
                )}
              </div>
              {/* Inline stats */}
              <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-sky-400" />
                  <span className="text-xs font-bold text-sky-200">{requestStats.pending}</span>
                  <span className="text-[11px] text-slate-500">pending</span>
                </div>
                <div className="h-3 w-px bg-white/[0.08]" />
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-200">{requestStats.available}</span>
                  <span className="text-[11px] text-slate-500">ready</span>
                </div>
                <div className="h-3 w-px bg-white/[0.08]" />
                <div className="flex items-center gap-1.5">
                  <CircleDashed className="h-3 w-3 text-purple-400" />
                  <span className="text-xs font-bold text-purple-200">{requestStats.partial}</span>
                  <span className="text-[11px] text-slate-500">partial</span>
                </div>
                <div className="h-3 w-px bg-white/[0.08]" />
                <div className="flex items-center gap-1.5">
                  <Download className="h-3 w-3 text-amber-400" />
                  <span className="text-xs font-bold text-amber-200">{requestStats.processing}</span>
                  <span className="text-[11px] text-slate-500">active</span>
                </div>
              </div>
            </div>

            {/* Greeting */}
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                {greeting},{" "}
                <span className="bg-gradient-to-r from-sky-300 to-indigo-300 bg-clip-text text-transparent">{name}</span>
              </h1>
              <p className="mt-1.5 max-w-lg text-sm text-slate-400">
                Keep track of your requests, continue where you left off, and discover something new to watch.
              </p>
            </div>

            {/* Quick nav */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:max-w-xl">
              <HeroShortcut href="/discover" label="Discover" icon={Compass} />
              <HeroShortcut href="/movies" label="Movies" icon={Film} />
              <HeroShortcut href="/tv" label="TV Shows" icon={Tv} />
              <HeroShortcut href={isAdmin ? "/admin/requests" : "/requests"} label="Requests" icon={Layers} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Personal Stats Grid ─── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Watch Stats Widget */}
        <section className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#0d1323] to-[#131b35] p-5">
          <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-sky-500/10 blur-2xl" />
          <div className="relative">
            <div className="mb-4 flex items-center gap-2.5">
              <TrendingUp className="h-5 w-5 text-sky-400" />
              <h2 className="text-lg font-bold text-white">Your Activity</h2>
            </div>
            {watchStats && watchStats.totalHoursWatched !== undefined ? (
              <div className="space-y-4">
                {/* Achievement Badge */}
                {achievement && achievement.level && (
                  <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full",
                      achievement.level === "legendary" ? "bg-gradient-to-br from-amber-400/20 to-orange-400/20" :
                      achievement.level === "marathon" ? "bg-gradient-to-br from-purple-400/20 to-pink-400/20" :
                      achievement.level === "binge" ? "bg-gradient-to-br from-blue-400/20 to-cyan-400/20" :
                      achievement.level === "watcher" ? "bg-gradient-to-br from-green-400/20 to-emerald-400/20" :
                      "bg-gradient-to-br from-slate-400/20 to-gray-400/20"
                    )}>
                      {achievement.level === "legendary" ? "👑" :
                       achievement.level === "marathon" ? "🔥" :
                       achievement.level === "binge" ? "⚡" :
                       achievement.level === "watcher" ? "⭐" : "📺"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white capitalize">{achievement.level} Level</p>
                      <p className="text-xs text-slate-400">{achievement.hoursThisWeek}h this week</p>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-all"
                          style={{ width: `${Math.min((achievement.progress / achievement.nextMilestone) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-2xl font-bold text-white">{watchStats.moviesThisWeek}</p>
                        <p className="text-xs text-slate-400">Movies this week</p>
                      </div>
                      <Film className="h-5 w-5 text-sky-400/60" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-2xl font-bold text-white">{watchStats.episodesThisWeek}</p>
                        <p className="text-xs text-slate-400">Episodes this week</p>
                      </div>
                      <Tv className="h-5 w-5 text-indigo-400/60" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-2xl font-bold text-white">{watchStats.totalHoursWatched.toFixed(0)}</p>
                        <p className="text-xs text-slate-400">Total hours</p>
                      </div>
                      <Clock className="h-5 w-5 text-purple-400/60" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-2xl font-bold text-white">{watchStats.totalMoviesWatched + watchStats.totalEpisodesWatched}</p>
                        <p className="text-xs text-slate-400">Total watched</p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-emerald-400/60" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-500">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-slate-600" />
                Loading stats...
              </div>
            )}
          </div>
        </section>

        {/* Upcoming Episodes Widget */}
        <section className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#0d1323] to-[#131b35] p-5">
          <div className="absolute right-0 bottom-0 h-32 w-32 translate-x-8 translate-y-8 rounded-full bg-purple-500/10 blur-2xl" />
          <div className="relative">
            <div className="mb-4 flex items-center gap-2.5">
              <Calendar className="h-5 w-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white">Upcoming This Week</h2>
            </div>
            {upcomingEpisodes && Array.isArray(upcomingEpisodes) && upcomingEpisodes.length > 0 ? (
              <div className="space-y-2">
                {upcomingEpisodes.slice(0, 5).map((episode, idx) => (
                  <PrefetchLink
                    key={`${episode.seriesId}-${episode.seasonNumber}-${episode.episodeNumber}`}
                    href={`/tv/${episode.seriesId}`}
                    className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-slate-800">
                      {episode.seriesPoster && (
                        <Image
                          src={`https://image.tmdb.org/t/p/w92${episode.seriesPoster}`}
                          alt={episode.seriesName}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-white group-hover:text-sky-300 transition-colors">
                        {episode.seriesName}
                      </p>
                      <p className="text-xs text-slate-400">
                        S{episode.seasonNumber}E{episode.episodeNumber} • {episode.episodeName}
                      </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className={cn(
                        "text-xs font-semibold",
                        episode.daysUntil === 0 ? "text-emerald-400" :
                        episode.daysUntil === 1 ? "text-amber-400" :
                        "text-slate-400"
                      )}>
                        {episode.daysUntil === 0 ? "Today" :
                         episode.daysUntil === 1 ? "Tomorrow" :
                         `${episode.daysUntil}d`}
                      </span>
                    </div>
                  </PrefetchLink>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Calendar className="mx-auto mb-2 h-8 w-8 text-slate-700" />
                <p className="text-sm text-slate-500">No upcoming episodes this week</p>
                <p className="mt-1 text-xs text-slate-600">Add shows to your favorites or watchlist</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ─── Continue Watching ─── */}
      {continueWatching.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2.5">
            <Play className="h-5 w-5 text-sky-400" />
            <h2 className="text-lg font-bold text-white">Continue Watching</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {continueWatching.map((item) => (
              <a
                key={item.id}
                href={item.playUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-slate-900/60 transition-all duration-200 hover:border-white/15 hover:shadow-lg hover:shadow-black/20">
                  <div className="relative aspect-[2/3]">
                    {item.posterUrl ? (
                      <Image src={item.posterUrl} alt={item.title} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute left-2 right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <div className="rounded-md border border-white/20 bg-black/55 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                        {item.title}
                      </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="rounded-full bg-white/20 p-3 backdrop-blur-sm">
                        <Play className="h-6 w-6 text-white" fill="white" />
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0">
                      <div className="h-1 w-full bg-white/10">
                        <div
                          className="h-full bg-sky-400 transition-all"
                          style={{ width: `${Math.round(item.progress * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="absolute left-2 right-2 bottom-2">
                      <p className="line-clamp-2 text-xs font-semibold text-white">{item.title}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {item.type === "episode" ? "TV" : "Movie"} &middot; {Math.round(item.progress * 100)}%
                      </p>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ─── Your Requests (compact grid) ─── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-white">
            <Sparkles className="h-5 w-5 text-sky-400" />
            Your Requests
          </h2>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {[
                { key: "all", label: "All" },
                { key: "pending", label: "Pending" },
                { key: "ready", label: "Ready" },
                { key: "active", label: "Active" },
              ].map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setRequestFilter(filter.key as "all" | "pending" | "ready" | "active")}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    requestFilter === filter.key ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <PrefetchLink href={isAdmin ? "/admin/requests" : "/requests"} className="group flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white">
              View all
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </PrefetchLink>
          </div>
        </div>

        {recentRequestsLoading && !recentRequests.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="aspect-video animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]" />
            ))}
          </div>
        ) : recentRequestsError ? (
          <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] p-4 text-sm text-rose-200">
            <XCircle className="h-5 w-5 shrink-0 text-rose-400" />
            Failed to load requests.
          </div>
        ) : filteredRequests.length ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {pagedRequests.map((item, idx) => {
                const href = item.type === "movie" ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;
                return (
                  <HoverMediaCard
                    key={item.id}
                    id={item.tmdbId}
                    title={item.title}
                    posterUrl={item.poster ?? item.backdrop}
                    href={href}
                    year={item.year}
                    mediaType={item.type}
                    mediaStatus={statusToMediaStatus(item.status)}
                    imagePriority={idx < 8}
                    stableHover
                  />
                );
              })}
            </div>
            {requestsPageCount > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                <button
                  type="button"
                  onClick={() => setRequestPage(Math.max(0, requestPage - 1))}
                  disabled={requestPage === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.09] disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                <span className="text-[11px] text-slate-400">
                  {requestPage + 1}/{requestsPageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setRequestPage(Math.min(requestsPageCount - 1, requestPage + 1))}
                  disabled={requestPage >= requestsPageCount - 1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.09] disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center text-sm text-slate-500">
            {recentRequests.length
              ? "No requests in this filter."
              : "No requests yet. Head to Discover to find something to watch."}
          </div>
        )}
      </section>

      {/* ─── Recently Added ─── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-white">
            <Library className="h-5 w-5 text-emerald-400" />
            Recently Added
          </h2>
          <div className="flex items-center gap-2">
            {recentAddedPageCount > 1 && (
              <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                <button
                  type="button"
                  onClick={() => setRecentAddedPage((prev) => Math.max(0, prev - 1))}
                  disabled={recentAddedPage === 0}
                  className="rounded-md p-1.5 text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
                  aria-label="Previous recently added page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-[11px] text-slate-400">
                  {recentAddedPage + 1}/{recentAddedPageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setRecentAddedPage((prev) => Math.min(recentAddedPageCount - 1, prev + 1))}
                  disabled={recentAddedPage >= recentAddedPageCount - 1}
                  className="rounded-md p-1.5 text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
                  aria-label="Next recently added page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            <PrefetchLink href="/discover" className="group flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white">
              Discover
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </PrefetchLink>
          </div>
        </div>

        {recentAddedLoading && !recentAdded.length ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div key={idx} className="aspect-[2/3] animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]" />
            ))}
          </div>
        ) : recentAddedError ? (
          <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] p-4 text-sm text-rose-200">
            <XCircle className="h-5 w-5 shrink-0 text-rose-400" />
            Failed to load recently added media.
          </div>
        ) : recentAdded.length ? (
          <div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {pagedRecentAdded.map((item, idx) => {
                const type = item.type === "tv" ? "tv" : "movie";
                const href = type === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`;
                return (
                  <HoverMediaCard
                    key={`${type}-${item.id}`}
                    id={item.id}
                    title={item.title}
                    posterUrl={item.posterUrl}
                    href={href}
                    year={item.year}
                    mediaType={type}
                    mediaStatus={item.mediaStatus as MediaStatus | undefined}
                    imagePriority={idx < 12}
                    stableHover
                  />
                );
              })}
            </div>
            {recentAddedPageCount > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
                <button
                  type="button"
                  onClick={() => setRecentAddedPage((prev) => Math.max(0, prev - 1))}
                  disabled={recentAddedPage === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.09] disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setRecentAddedPage((prev) => Math.min(recentAddedPageCount - 1, prev + 1))}
                  disabled={recentAddedPage >= recentAddedPageCount - 1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.09] disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center text-sm text-slate-500">
            Nothing recently added yet.
          </div>
        )}
      </section>

      {/* ─── Personalized Recommendations ─── */}
      {personalizedRecs && Array.isArray(personalizedRecs) && personalizedRecs.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2.5 text-lg font-bold text-white">
                <Sparkles className="h-5 w-5 text-indigo-400" />
                For You
              </h2>
              {personalizedRecs[0]?.reasoning && (
                <p className="mt-1 text-xs text-slate-400">{personalizedRecs[0].reasoning}</p>
              )}
            </div>
            <PrefetchLink href="/recommendations" className="group flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white">
              See all
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </PrefetchLink>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {personalizedRecs.slice(0, 6).map((rec, idx) => {
              const type = rec.type.toLowerCase().includes("series") || rec.type.toLowerCase().includes("tv") ? "tv" : "movie";
              const tmdbId = rec.tmdbId || parseInt(rec.id, 10);
              const href = type === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
              const posterUrl = rec.posterPath ? `https://image.tmdb.org/t/p/w500${rec.posterPath}` : null;
              const year = rec.year ? rec.year.toString() : undefined;
              
              return (
                <div key={rec.id} className="space-y-1.5">
                  <HoverMediaCard
                    id={tmdbId}
                    title={rec.name}
                    posterUrl={posterUrl}
                    href={href}
                    year={year}
                    mediaType={type}
                    imagePriority={idx < 6}
                    stableHover
                  />
                  {rec.reasoning && (
                    <p className="text-xs text-slate-400 px-0.5">{rec.reasoning}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Friends Activity ─── */}
      {friendsActivity && Array.isArray(friendsActivity) && friendsActivity.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2.5 text-lg font-bold text-white">
              <Users className="h-5 w-5 text-blue-400" />
              Friends Activity
            </h2>
            <PrefetchLink href="/social" className="group flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white">
              See all
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </PrefetchLink>
          </div>
          <div className="space-y-3">
            {friendsActivity.map((activity) => {
              const ActivityIcon = 
                activity.type === "review" ? Star :
                activity.type === "favorite" || activity.type === "save_list" ? Heart :
                activity.type === "list_create" ? Library :
                activity.type === "reaction" ? Zap :
                Users;

              let activityText = "";
              let mediaTitle = "";
              let mediaHref = "";

              if (activity.type === "review" && activity.metadata) {
                mediaTitle = activity.metadata.title || "Unknown";
                const tmdbId = activity.metadata.tmdbId;
                const mediaType = activity.metadata.mediaType || "movie";
                mediaHref = mediaType === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
                activityText = `rated ${mediaTitle}`;
              } else if (activity.type === "favorite" && activity.metadata) {
                mediaTitle = activity.metadata.title || "Unknown";
                const tmdbId = activity.metadata.tmdbId;
                const mediaType = activity.metadata.mediaType || "movie";
                mediaHref = mediaType === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
                activityText = `added ${mediaTitle} to favorites`;
              } else if (activity.type === "list_create" && activity.metadata) {
                const listName = activity.metadata.listName || "a list";
                activityText = `created "${listName}"`;
                mediaHref = `/lists/${activity.metadata.listId}`;
              } else if (activity.type === "save_list" && activity.metadata) {
                const listName = activity.metadata.listName || "a list";
                activityText = `saved "${listName}"`;
                mediaHref = `/lists/${activity.metadata.listId}`;
              } else if (activity.type === "reaction" && activity.metadata) {
                const listName = activity.metadata.listName || "a list";
                activityText = `reacted to "${listName}"`;
                mediaHref = `/lists/${activity.metadata.listId}`;
              } else {
                activityText = "had some activity";
              }

              return (
                <div key={activity.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-white/15 hover:bg-white/10">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                    <ActivityIcon className="h-5 w-5 text-blue-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">
                      <PrefetchLink href={`/u/${activity.username}`} className="font-semibold hover:text-blue-300 transition-colors">
                        {activity.displayName || activity.username}
                      </PrefetchLink>
                      {" "}
                      <span className="text-slate-400">{activityText}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(activity.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  {mediaHref && (
                    <PrefetchLink href={mediaHref} className="shrink-0 text-slate-400 hover:text-white transition-colors">
                      <ArrowUpRight className="h-4 w-4" />
                    </PrefetchLink>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
