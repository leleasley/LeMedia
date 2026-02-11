"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
  Clock,
  Compass,
  Dices,
  Download,
  Film,
  Layers,
  Library,
  Loader2,
  Play,
  Sparkles,
  Tv,
  XCircle,
} from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { cn } from "@/lib/utils";
import { MediaStatus } from "@/lib/media-status";

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

type SurpriseResult = {
  id: number;
  title: string;
  year: string;
  poster: string | null;
  backdrop: string | null;
  type: "movie" | "tv";
  overview: string;
  tmdbRating: number | null;
  voteCount: number | null;
  imdbId: string | null;
  runtime: number | null;
  genres: string[];
};

type GenreItem = {
  id: number;
  name: string;
};

type TmdbDiscoverItem = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
};

type StatusTone = {
  label: string;
  className: string;
  dotColor: string;
};

// ─── Status helpers ───

function requestStatusTone(status: string): StatusTone {
  const value = status.toLowerCase();
  if (["available", "completed"].includes(value))
    return { label: "Available", className: "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30", dotColor: "bg-emerald-400" };
  if (["partially_available"].includes(value))
    return { label: "Partial", className: "bg-purple-500/15 text-purple-300 border border-purple-400/30", dotColor: "bg-purple-400" };
  if (["pending", "queued", "submitted"].includes(value))
    return { label: "Pending", className: "bg-sky-500/15 text-sky-300 border border-sky-400/30", dotColor: "bg-sky-400" };
  if (["downloading", "processing"].includes(value))
    return { label: "Processing", className: "bg-amber-500/15 text-amber-300 border border-amber-400/30", dotColor: "bg-amber-400" };
  if (["denied", "failed", "removed"].includes(value))
    return { label: "Failed", className: "bg-rose-500/15 text-rose-300 border border-rose-400/30", dotColor: "bg-rose-400" };
  return { label: "Requested", className: "bg-white/10 text-slate-200 border border-white/20", dotColor: "bg-slate-400" };
}

function mediaStatusTone(mediaStatus?: number): StatusTone {
  if (mediaStatus === MediaStatus.AVAILABLE)
    return { label: "Available", className: "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30", dotColor: "bg-emerald-400" };
  if (mediaStatus === MediaStatus.PARTIALLY_AVAILABLE)
    return { label: "Partial", className: "bg-purple-500/15 text-purple-300 border border-purple-400/30", dotColor: "bg-purple-400" };
  if (mediaStatus === MediaStatus.DOWNLOADING || mediaStatus === MediaStatus.PROCESSING)
    return { label: "Downloading", className: "bg-amber-500/15 text-amber-300 border border-amber-400/30", dotColor: "bg-amber-400" };
  return { label: "Monitored", className: "bg-white/10 text-slate-200 border border-white/20", dotColor: "bg-slate-400" };
}

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

function StatusDot({ className }: { className: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-40", className)} />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", className)} />
    </span>
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

  const { data: movieGenresData } = useSWR<{ genres: GenreItem[] }>(
    "/api/v1/tmdb/genres?type=movie",
    { revalidateOnFocus: false }
  );

  const { data: tvGenresData } = useSWR<{ genres: GenreItem[] }>(
    "/api/v1/tmdb/genres?type=tv",
    { revalidateOnFocus: false }
  );

  const [greeting, setGreeting] = useState("Welcome");
  const [nowLine, setNowLine] = useState("");
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "ready" | "active">("all");
  const [requestPage, setRequestPage] = useState(0);
  const [recentAddedPage, setRecentAddedPage] = useState(0);

  const [surpriseType, setSurpriseType] = useState<"movie" | "tv">("movie");
  const [selectedGenreId, setSelectedGenreId] = useState<number | null>(null);
  const [surpriseRated, setSurpriseRated] = useState<"any" | "top">("any");
  const [surpriseStep, setSurpriseStep] = useState<"idle" | "type" | "rating" | "genre" | "loading" | "result">("idle");
  const [surpriseFading, setSurpriseFading] = useState(false);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseResult, setSurpriseResult] = useState<SurpriseResult | null>(null);

  const transitionSurprise = useCallback((next: "idle" | "type" | "rating" | "genre" | "loading" | "result") => {
    setSurpriseFading(true);
    setTimeout(() => {
      setSurpriseStep(next);
      setSurpriseFading(false);
    }, 180);
  }, []);

  const generateSurprise = useCallback(async () => {
    const randomPage = Math.floor(Math.random() * 5) + 1;
    const params = new URLSearchParams({
      page: String(randomPage),
      sort_by: "popularity.desc",
      "vote_count.gte": surpriseRated === "top" ? "500" : "120",
    });
    if (surpriseRated === "top") {
      params.set("vote_average.gte", "7");
    }
    if (selectedGenreId) params.set("with_genres", String(selectedGenreId));
    const endpoint = `/api/v1/tmdb/discover/${surpriseType}?${params.toString()}`;

    setSurpriseLoading(true);
    transitionSurprise("loading");
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      const results = (Array.isArray(data?.results) ? data.results : []) as TmdbDiscoverItem[];
      const candidates = results.filter((item) => item.poster_path || item.backdrop_path);
      if (!candidates.length) {
        setSurpriseResult(null);
        transitionSurprise("idle");
        return;
      }
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      const detailEndpoint = surpriseType === "movie"
        ? `/api/v1/movie/${picked.id}?details=1`
        : `/api/v1/tv/${picked.id}?details=1`;
      const detailRes = await fetch(detailEndpoint);
      const detailJson = await detailRes.json();
      const media = surpriseType === "movie" ? detailJson?.details?.movie : detailJson?.details?.tv;
      const title = surpriseType === "movie" ? picked.title : picked.name;
      const dateValue = surpriseType === "movie" ? picked.release_date : picked.first_air_date;

      setSurpriseResult({
        id: picked.id,
        title: title || "Untitled",
        year: typeof dateValue === "string" ? dateValue.slice(0, 4) : "",
        poster: picked.poster_path ? `https://image.tmdb.org/t/p/w500${picked.poster_path}` : null,
        backdrop: picked.backdrop_path ? `https://image.tmdb.org/t/p/w1280${picked.backdrop_path}` : null,
        type: surpriseType,
        overview: picked.overview ?? "",
        tmdbRating: typeof media?.vote_average === "number" ? media.vote_average : null,
        voteCount: typeof media?.vote_count === "number" ? media.vote_count : null,
        imdbId: typeof media?.imdb_id === "string" ? media.imdb_id : null,
        runtime: typeof media?.runtime === "number"
          ? media.runtime
          : Array.isArray(media?.episode_run_time) && media.episode_run_time.length > 0
          ? Number(media.episode_run_time[0]) || null
          : null,
        genres: Array.isArray(media?.genres) ? media.genres.map((g: { name?: string }) => g?.name).filter(Boolean) : [],
      });
      transitionSurprise("result");
    } catch {
      setSurpriseResult(null);
      transitionSurprise("idle");
    } finally {
      setSurpriseLoading(false);
    }
  }, [selectedGenreId, surpriseType, surpriseRated, transitionSurprise]);

  const recentRequests = useMemo(() => recentRequestsData?.items ?? [], [recentRequestsData]);
  const recentAdded = useMemo(() => recentAddedData?.items ?? [], [recentAddedData]);
  const continueWatching = useMemo(() => continueWatchingData?.items ?? [], [continueWatchingData]);
  const services = useMemo(() => healthData?.services ?? [], [healthData]);
  const movieGenres = movieGenresData?.genres ?? [];
  const tvGenres = tvGenresData?.genres ?? [];

  // Derived stats
  const requestStats = recentRequests.reduce(
    (acc, item) => {
      const v = item.status.toLowerCase();
      acc.total += 1;
      if (["available", "completed", "partially_available"].includes(v)) acc.available += 1;
      else if (["pending", "queued", "submitted"].includes(v)) acc.pending += 1;
      else if (["downloading", "processing"].includes(v)) acc.processing += 1;
      else if (["denied", "failed", "removed"].includes(v)) acc.failed += 1;
      return acc;
    },
    { total: 0, available: 0, pending: 0, processing: 0, failed: 0 }
  );

  const libraryPartial = recentAdded.filter((i) => i.mediaStatus === MediaStatus.PARTIALLY_AVAILABLE).length;
  const downloadingCount = recentAdded.filter((i) => i.mediaStatus === MediaStatus.DOWNLOADING || i.mediaStatus === MediaStatus.PROCESSING).length;
  const filteredRequests = recentRequests.filter((item) => {
    const value = item.status.toLowerCase();
    if (requestFilter === "pending") return ["pending", "queued", "submitted"].includes(value);
    if (requestFilter === "ready") return ["available", "completed", "partially_available"].includes(value);
    if (requestFilter === "active") return ["downloading", "processing"].includes(value);
    return true;
  });
  const requestsPerPage = 6;
  const requestsPageCount = Math.max(1, Math.ceil(filteredRequests.length / requestsPerPage));
  const pagedRequests = useMemo(
    () => filteredRequests.slice(requestPage * requestsPerPage, (requestPage + 1) * requestsPerPage),
    [filteredRequests, requestPage]
  );
  const recentAddedPerPage = 12;
  const recentAddedPageCount = Math.max(1, Math.ceil(recentAdded.length / recentAddedPerPage));
  const pagedRecentAdded = useMemo(
    () => recentAdded.slice(recentAddedPage * recentAddedPerPage, (recentAddedPage + 1) * recentAddedPerPage),
    [recentAdded, recentAddedPage]
  );
  const activeGenres = surpriseType === "tv" ? tvGenres : movieGenres;

  useEffect(() => {
    setRequestPage((prev) => Math.min(prev, requestsPageCount - 1));
  }, [requestsPageCount]);

  useEffect(() => {
    setRecentAddedPage((prev) => Math.min(prev, recentAddedPageCount - 1));
  }, [recentAddedPageCount]);

  useEffect(() => {
    setSelectedGenreId(null);
    setSurpriseRated("any");
  }, [surpriseType]);

  useEffect(() => {
    setGreeting(getGreeting());
    setNowLine(
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    );
  }, []);

  useEffect(() => {
    setRequestPage(0);
  }, [requestFilter]);

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
                  <span className="text-xs font-bold text-purple-200">{libraryPartial}</span>
                  <span className="text-[11px] text-slate-500">partial</span>
                </div>
                <div className="h-3 w-px bg-white/[0.08]" />
                <div className="flex items-center gap-1.5">
                  <Download className="h-3 w-3 text-amber-400" />
                  <span className="text-xs font-bold text-amber-200">{downloadingCount}</span>
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
              {pagedRequests.map((item) => {
                const tone = requestStatusTone(item.status);
                const href = item.type === "movie" ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;
                return (
                  <PrefetchLink
                    key={item.id}
                    href={href}
                    className="group overflow-hidden rounded-xl border border-white/[0.06] bg-slate-900/60 transition-all duration-200 hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
                  >
                    <div className="relative aspect-video">
                      {item.backdrop ? (
                        <Image src={item.backdrop} alt={item.title} fill className="object-cover" unoptimized />
                      ) : item.poster ? (
                        <Image src={item.poster} alt={item.title} fill className="object-cover" unoptimized />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                      {/* Status badge */}
                      <div className="absolute right-2 top-2">
                        <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur-sm", tone.className)}>
                          <StatusDot className={tone.dotColor} />
                          {tone.label}
                        </span>
                      </div>
                      {/* Title + meta */}
                      <div className="absolute left-2.5 right-2.5 bottom-2">
                        <p className="line-clamp-1 text-xs font-bold text-white">{item.title}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {item.year ?? ""}{item.year ? " · " : ""}{item.type === "tv" ? "TV Show" : "Movie"}
                        </p>
                      </div>
                    </div>
                  </PrefetchLink>
                );
              })}
            </div>
            {requestsPageCount > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                <button
                  type="button"
                  onClick={() => setRequestPage((prev) => Math.max(0, prev - 1))}
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
                  onClick={() => setRequestPage((prev) => Math.min(requestsPageCount - 1, prev + 1))}
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
              {pagedRecentAdded.map((item) => {
                const type = item.type === "tv" ? "tv" : "movie";
                const href = type === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`;
                const tone = mediaStatusTone(item.mediaStatus);
                return (
                  <PrefetchLink key={`${type}-${item.id}`} href={href} className="group block">
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

                        {item.mediaStatus === MediaStatus.PARTIALLY_AVAILABLE && (
                          <div className="absolute right-2 top-2">
                            <span className="flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300 backdrop-blur-sm">
                              <CircleDashed className="h-3 w-3" />
                              Partial
                            </span>
                          </div>
                        )}

                        <div className="absolute left-2 right-2 bottom-2">
                          <p className="line-clamp-2 text-xs font-semibold text-white">{item.title}</p>
                          <div className="mt-1 flex items-center justify-between gap-1">
                            <span className="text-[10px] uppercase tracking-wide text-slate-400">
                              {type === "tv" ? "TV" : "Movie"}{item.year ? ` \u00b7 ${item.year}` : ""}
                            </span>
                            {item.mediaStatus !== MediaStatus.PARTIALLY_AVAILABLE && (
                              <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", tone.className)}>
                                {tone.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </PrefetchLink>
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

      {/* ─── Surprise Me ─── */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-[#0d1323] to-[#131b35]">
        <div className="p-5 md:p-6">
          <div className={cn("min-h-[180px] transition-opacity duration-200", surpriseFading ? "opacity-0" : "opacity-100")}>
            {surpriseStep === "idle" && (
              <div className="flex min-h-[180px] flex-col justify-between">
                <div>
                  <h3 className="flex items-center gap-2.5 text-lg font-bold text-white">
                    <Dices className="h-5 w-5 text-indigo-400" />
                    Surprise Me
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">Not sure what to watch? Get a random recommendation.</p>
                </div>
                <button
                  type="button"
                  onClick={() => transitionSurprise("type")}
                  className="inline-flex w-fit items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:border-indigo-400/50 hover:bg-indigo-500/25"
                >
                  <Dices className="h-4 w-4" />
                  Start Surprise
                </button>
              </div>
            )}

            {surpriseStep === "type" && (
              <div className="flex min-h-[180px] flex-col justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Question 1</p>
                  <h4 className="text-lg font-semibold text-white">What do you fancy right now?</h4>
                  <div className="mt-3 inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                    {[
                      { key: "movie", label: "Movie" },
                      { key: "tv", label: "TV Show" },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setSurpriseType(option.key as "movie" | "tv")}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          surpriseType === option.key ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => transitionSurprise("idle")}
                    className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => transitionSurprise("rating")}
                    className="rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {surpriseStep === "rating" && (
              <div className="flex min-h-[180px] flex-col justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Question 2</p>
                  <h4 className="text-lg font-semibold text-white">Would you like a highly rated {surpriseType === "movie" ? "movie" : "show"}?</h4>
                  <div className="mt-3 inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                    {[
                      { key: "any", label: "Any" },
                      { key: "top", label: "Highly Rated" },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setSurpriseRated(option.key as "any" | "top")}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          surpriseRated === option.key ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => transitionSurprise("type")}
                    className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => transitionSurprise("genre")}
                    className="rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {surpriseStep === "genre" && (
              <div className="flex min-h-[180px] flex-col justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Question 3</p>
                  <h4 className="text-lg font-semibold text-white">What genre do you fancy?</h4>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedGenreId(null)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        selectedGenreId === null
                          ? "border-indigo-300/60 bg-indigo-400/20 text-indigo-100"
                          : "border-white/15 bg-white/5 text-slate-300 hover:text-white"
                      )}
                    >
                      Any genre
                    </button>
                    {activeGenres.slice(0, 14).map((genre) => (
                      <button
                        key={genre.id}
                        type="button"
                        onClick={() => setSelectedGenreId(genre.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          selectedGenreId === genre.id
                            ? "border-indigo-300/60 bg-indigo-400/20 text-indigo-100"
                            : "border-white/15 bg-white/5 text-slate-300 hover:text-white"
                        )}
                      >
                        {genre.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => transitionSurprise("rating")}
                    className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={generateSurprise}
                    disabled={surpriseLoading}
                    className="rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/25 disabled:opacity-50"
                  >
                    Generate now
                  </button>
                </div>
              </div>
            )}

            {surpriseStep === "loading" && (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
                <p className="text-base font-semibold text-white">Generating now</p>
                <p className="text-sm text-slate-400">Pulling a random {surpriseType === "movie" ? "movie" : "show"} from TMDB.</p>
              </div>
            )}

            {surpriseStep === "result" && surpriseResult && (
              <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
                <PrefetchLink href={surpriseResult.type === "movie" ? `/movie/${surpriseResult.id}` : `/tv/${surpriseResult.id}`} className="group block">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-white/10 bg-slate-900/60">
                    {surpriseResult.poster ? (
                      <Image src={surpriseResult.poster} alt={surpriseResult.title} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute left-2 top-2 rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {surpriseResult.type}
                    </div>
                  </div>
                </PrefetchLink>
                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-white">{surpriseResult.title}</h4>
                  <p className="line-clamp-2 text-sm text-slate-400">{surpriseResult.overview || "No overview available."}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    {surpriseResult.year && <span className="rounded-md bg-white/[0.06] px-2 py-0.5">{surpriseResult.year}</span>}
                    {surpriseResult.tmdbRating && <span className="rounded-md bg-white/[0.06] px-2 py-0.5">TMDB {surpriseResult.tmdbRating.toFixed(1)}</span>}
                    {surpriseResult.runtime && <span className="rounded-md bg-white/[0.06] px-2 py-0.5">{surpriseResult.runtime}m</span>}
                    {surpriseResult.genres.slice(0, 3).map((g) => (
                      <span key={g} className="rounded-md bg-white/[0.06] px-2 py-0.5">{g}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={generateSurprise}
                      className="rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
                    >
                      Roll again
                    </button>
                    <button
                      type="button"
                      onClick={() => transitionSurprise("type")}
                      className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08]"
                    >
                      Change choices
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
