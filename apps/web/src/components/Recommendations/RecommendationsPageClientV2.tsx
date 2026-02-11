"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { HeartIcon, StarIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid, StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import useSWR from "swr";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const error = new Error("Request failed");
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return res.json();
};

type RecommendationItem = {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  rating: number;
  description: string;
  type: "movie" | "tv";
  genres?: number[];
  explanation?: string;
  listStatus?: { favorite: boolean; watchlist: boolean };
};

const ITEMS_PER_PAGE = 40;

const GENRES = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "SciFi" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" }
];

export function RecommendationsPageClientV2() {
  const [page, setPage] = useState(0);
  const [prevPage, setPrevPage] = useState(0);
  const [mode, setMode] = useState<"personalized" | "trending">("personalized");
  const [mediaType, setMediaType] = useState<string>("all");
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<"rating" | "popularity" | "year">("rating");
  const [search, setSearch] = useState("");
  const [inListState, setInListState] = useState<{ [key: string]: { favorite: boolean; watchlist: boolean } }>({});
  const toast = useToast();

  const offset = page * ITEMS_PER_PAGE;
  const genreParam = selectedGenres.length > 0 ? selectedGenres.join(",") : "";

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(ITEMS_PER_PAGE));
    params.set("offset", String(offset));
    params.set("mode", mode);
    if (mediaType !== "all") params.set("mediaType", mediaType);
    if (genreParam) params.set("genre", genreParam);
    params.set("sort", sortBy);
    if (search) params.set("search", search);
    return `/api/v1/recommendations?${params.toString()}`;
  }, [offset, mode, mediaType, genreParam, sortBy, search]);

  const { data, error, mutate } = useSWR<{ items: RecommendationItem[]; hasMore: boolean }>(
    requestUrl,
    fetcher,
    { refreshInterval: 600000 }
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const hasMore = data?.hasMore ?? false;
  const [loading, setLoading] = useState(true);
  const isPageChanging = page !== prevPage;
  const isSm = useMediaQuery("(min-width: 640px)", false);
  const isMd = useMediaQuery("(min-width: 768px)", false);
  const isLg = useMediaQuery("(min-width: 1024px)", false);
  const isXl = useMediaQuery("(min-width: 1280px)", false);
  const parentRef = useRef<HTMLElement | null>(null);

  const columns = useMemo(() => {
    if (isXl) return 6;
    if (isLg) return 5;
    if (isMd) return 4;
    if (isSm) return 3;
    return 2;
  }, [isSm, isMd, isLg, isXl]);

  useEffect(() => {
    parentRef.current = document.querySelector("main");
  }, []);

  useEffect(() => {
    setLoading(true);
  }, [requestUrl]);

  useEffect(() => {
    if (!data && !error) return;
    setLoading(false);
    setPrevPage(page);
  }, [data, error, page]);

  const handleRefresh = async () => {
    setLoading(true);
    setPage(0);
    try {
      await mutate();
    } finally {
      setLoading(false);
      setPrevPage(0);
    }
  };

  const toggleGenre = (genreId: number) => {
    setSelectedGenres(prev =>
      prev.includes(genreId) ? prev.filter(g => g !== genreId) : [...prev, genreId]
    );
    setPage(0);
  };

  const toggleListItem = async (itemId: number, itemType: "movie" | "tv", listType: "favorite" | "watchlist") => {
    const key = `${itemType}:${itemId}`;
    const isActive = inListState[key]?.[listType] ?? false;
    const method = isActive ? "DELETE" : "POST";

    try {
      const res = await csrfFetch("/api/v1/media-list", {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listType, mediaType: itemType, tmdbId: itemId })
      });
      if (!res.ok) throw new Error("Request failed");

      setInListState(prev => ({
        ...prev,
        [key]: { ...prev[key], [listType]: !isActive }
      }));

      toast.success(
        !isActive ? `Added to ${listType}` : `Removed from ${listType}`,
        { timeoutMs: 2000 }
      );
    } catch (error) {
      toast.error("Failed to update list", { timeoutMs: 2000 });
    }
  };

  const rowCount = Math.ceil(items.length / columns);
  const useVirtual = items.length > 60;
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current ?? document.scrollingElement,
    estimateSize: () => 360,
    overscan: 2
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, columns, items.length]);

  useEffect(() => {
    if (items.length === 0) return;
    const updates: { [key: string]: { favorite: boolean; watchlist: boolean } } = {};
    items.forEach((item) => {
      const key = `${item.type}:${item.id}`;
      updates[key] = {
        favorite: Boolean(item.listStatus?.favorite),
        watchlist: Boolean(item.listStatus?.watchlist)
      };
    });
    setInListState(prev => ({ ...prev, ...updates }));
  }, [items]);

  if (loading || isPageChanging) {
    return (
      <div>
        <style>{`
          @keyframes shimmer {
            0% { background-position: -1000px 0; }
            100% { background-position: 1000px 0; }
          }
          .shimmer {
            background: linear-gradient(90deg, rgba(255,255,255,.1) 25%, rgba(255,255,255,.2) 50%, rgba(255,255,255,.1) 75%);
            background-size: 1000px 100%;
            animation: shimmer 2s infinite;
          }
        `}</style>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] bg-gray-800 rounded-lg shimmer" />
              <div className="mt-3 h-4 bg-gray-800 rounded w-3/4 shimmer" />
              <div className="mt-2 h-3 bg-gray-800 rounded w-1/2 shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-8 text-center">
        <p className="text-red-200">Unable to load recommendations.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-12 text-center">
        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center mb-6">
          <svg className="h-10 w-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">No recommendations found</h3>
        <p className="text-gray-400 mb-8 max-w-sm mx-auto">
          Try adjusting your filters or search criteria.
        </p>
        <button
          onClick={() => {
            setSelectedGenres([]);
            setMediaType("all");
            setSearch("");
            setPage(0);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 text-sm font-medium text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-blue-500/25"
        >
          Reset Filters
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-8 space-y-4">
        {/* Controls Row 1: Mode, Media Type, Sort */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            <button
              onClick={() => { setMode("personalized"); setPage(0); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "personalized"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              Personalized
            </button>
            <button
              onClick={() => { setMode("trending"); setPage(0); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "trending"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              Trending
            </button>
          </div>

          <AdaptiveSelect
            value={mediaType}
            onValueChange={(value) => { 
              setMediaType(value);
              setPage(0); 
            }}
            options={[
              { value: "all", label: "All Media" },
              { value: "movie", label: "Movies" },
              { value: "tv", label: "TV Shows" }
            ]}
            placeholder="All Media"
          />

          <AdaptiveSelect
            value={sortBy}
            onValueChange={(value) => {
              setSortBy(value as "rating" | "popularity" | "year");
            }}
            options={[
              { value: "rating", label: "Sort: Rating" },
              { value: "popularity", label: "Sort: Popularity" },
              { value: "year", label: "Sort: Year" }
            ]}
            placeholder="Sort: Rating"
          />

          <button
            onClick={handleRefresh}
            className="px-3 py-2 rounded-lg bg-green-600/20 text-green-400 border border-green-500/30 text-sm font-medium hover:bg-green-600/30 transition-colors flex items-center gap-1"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Search & Genre Filters */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search recommendations..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          <div className="flex flex-wrap gap-2">
            {GENRES.map(genre => (
              <button
                key={genre.id}
                onClick={() => toggleGenre(genre.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedGenres.includes(genre.id)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {genre.name}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-sm text-blue-300 font-medium">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            {items.length} {items.length === 1 ? "item" : "items"} (page {page + 1})
          </span>
        </div>
      </div>

      {/* Grid */}
      {useVirtual ? (
        <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * columns;
            const rowItems = items.slice(startIndex, startIndex + columns);
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {rowItems.map((item) => {
                    const key = `${item.type}:${item.id}`;
                    const fav = inListState[key]?.favorite ?? false;
                    const watch = inListState[key]?.watchlist ?? false;

                    return (
                      <div key={key} className="relative group">
                        <HoverMediaCard
                          id={item.id}
                          title={item.title}
                          posterUrl={item.posterUrl}
                          href={`/${item.type}/${item.id}`}
                          year={item.year}
                          rating={item.rating}
                          description={item.description}
                          mediaType={item.type}
                        />
                        {/* Quick Add Buttons */}
                        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              toggleListItem(item.id, item.type, "favorite");
                            }}
                            className={`h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
                              fav
                                ? "bg-red-500/40 border-red-400/60 text-red-200"
                                : "bg-black/40 border-white/20 text-gray-300 hover:bg-red-500/60"
                            }`}
                          >
                            {fav ? <HeartIconSolid className="h-4 w-4" /> : <HeartIcon className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              toggleListItem(item.id, item.type, "watchlist");
                            }}
                            className={`h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
                              watch
                                ? "bg-yellow-500/40 border-yellow-400/60 text-yellow-200"
                                : "bg-black/40 border-white/20 text-gray-300 hover:bg-yellow-500/60"
                            }`}
                          >
                            {watch ? <StarIconSolid className="h-4 w-4" /> : <StarIcon className="h-4 w-4" />}
                          </button>
                        </div>
                        {/* Explanation Label */}
                        {item.explanation && (
                          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-gray-300 max-w-[150px] line-clamp-2">
                            {item.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => {
            const key = `${item.type}:${item.id}`;
            const fav = inListState[key]?.favorite ?? false;
            const watch = inListState[key]?.watchlist ?? false;

            return (
              <div key={key} className="relative group">
                <HoverMediaCard
                  id={item.id}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  href={`/${item.type}/${item.id}`}
                  year={item.year}
                  rating={item.rating}
                  description={item.description}
                  mediaType={item.type}
                />
                {/* Quick Add Buttons */}
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      toggleListItem(item.id, item.type, "favorite");
                    }}
                    className={`h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
                      fav
                        ? "bg-red-500/40 border-red-400/60 text-red-200"
                        : "bg-black/40 border-white/20 text-gray-300 hover:bg-red-500/60"
                    }`}
                  >
                    {fav ? <HeartIconSolid className="h-4 w-4" /> : <HeartIcon className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      toggleListItem(item.id, item.type, "watchlist");
                    }}
                    className={`h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
                      watch
                        ? "bg-yellow-500/40 border-yellow-400/60 text-yellow-200"
                        : "bg-black/40 border-white/20 text-gray-300 hover:bg-yellow-500/60"
                    }`}
                  >
                    {watch ? <StarIconSolid className="h-4 w-4" /> : <StarIcon className="h-4 w-4" />}
                  </button>
                </div>
                {/* Explanation Label */}
                {item.explanation && (
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-gray-300 max-w-[150px] line-clamp-2">
                    {item.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>

        <span className="text-sm text-gray-400">
          Page <span className="font-semibold text-white">{page + 1}</span>
        </span>

        <button
          onClick={() => setPage(page + 1)}
          disabled={!hasMore}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
