"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import { tmdbImageUrl } from "@/lib/tmdb-images";
import type { TmdbListFilters } from "@/lib/tmdb-client";
import type { MediaGridItem, MediaGridPage } from "@/types/media-grid";
import useVerticalScroll from "@/hooks/useVerticalScroll";
import useSWRInfinite from "swr/infinite";
import { fetchAvailabilityBatched } from "@/lib/availability-client";
import { MediaStatus } from "@/components/Common/StatusBadgeMini";

type MediaCard = {
  id: number;
  title: string;
  year: string;
  rating: number;
  poster: string | null;
  href: string;
  overview?: string;
  mediaStatus?: MediaStatus;
};

function toCards(list: MediaGridItem[], type: "movie" | "tv", availability: Record<number, boolean>): MediaCard[] {
  return list.map(item => ({
    id: item.id,
    title: type === "movie" ? item.title ?? "Untitled" : item.name ?? "Untitled",
    year: type === "movie"
      ? (item.release_date ?? "").slice(0, 4)
      : (item.first_air_date ?? "").slice(0, 4),
    rating: item.vote_average ?? 0,
    poster: tmdbImageUrl(item.poster_path, "w500"),
    href: type === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`,
    overview: item.overview,
    mediaStatus: availability[item.id] ? MediaStatus.AVAILABLE : undefined
  }));
}

// Placeholder component for loading state
function CardPlaceholder() {
  return (
    <div className="aspect-[2/3] w-full overflow-hidden rounded-lg sm:rounded-xl bg-gray-800 ring-1 ring-gray-700 animate-pulse" />
  );
}

export function MediaGrid({
  fetcher,
  type,
  title,
  showTitle = true,
  filters,
  initialPageCount = 3,
  initialData,
}: {
  fetcher: (page: number, filters?: TmdbListFilters) => Promise<MediaGridPage>;
  type: "movie" | "tv";
  title: string;
  showTitle?: boolean;
  filters?: TmdbListFilters;
  initialPageCount?: number;
  initialData?: MediaGridPage[] | MediaGridPage | null;
}) {
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const resetKey = `${filtersKey}-${type}`;
  
  const [availabilityState, setAvailabilityState] = useState({ key: resetKey, data: {} as Record<number, boolean> });
  const availability = useMemo(() => 
    availabilityState.key === resetKey ? availabilityState.data : {},
    [availabilityState, resetKey]
  );
  const setAvailability = useCallback((data: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)) => {
    setAvailabilityState(prev => ({
      key: resetKey,
      data: typeof data === 'function' ? data(prev.key === resetKey ? prev.data : {}) : data
    }));
  }, [resetKey]);
  
  const availabilityRef = useRef<Record<number, boolean>>({});
  const cacheKey = useMemo(() => `${type}:${filtersKey}`, [type, filtersKey]);
  const initialPages = Math.max(1, Math.min(initialPageCount, 5));
  const normalizedInitialData = Array.isArray(initialData)
    ? initialData
    : initialData
      ? [initialData]
      : null;
  const shouldUseInitialData = !!normalizedInitialData && filtersKey === "{}";
  const initialSize = shouldUseInitialData ? normalizedInitialData!.length : initialPages;
  const fallbackData = shouldUseInitialData ? normalizedInitialData! : undefined;

  useEffect(() => {
    availabilityRef.current = availability;
  }, [availability]);

  const { data, error, size, setSize, isValidating } = useSWRInfinite(
    (pageIndex, previousPageData) => {
      if (previousPageData && previousPageData.total_pages && pageIndex + 1 > previousPageData.total_pages) {
        return null;
      }
      // Include type in the key to ensure proper cache isolation between movies and TV
      return { page: pageIndex + 1, type, filtersKey, filters };
    },
    (key) => fetcher(key.page, key.filters),
    {
      initialSize,
      fallbackData,
      revalidateFirstPage: false,
      dedupingInterval: 0,
      focusThrottleInterval: 0,
    }
  );

  const items = useMemo(() => {
    const seen = new Set<number>();
    const merged: MediaGridItem[] = [];
    (data ?? []).forEach((page) => {
      page?.results?.forEach((item) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        merged.push(item);
      });
    });
    return merged;
  }, [data]);

  const isLoadingInitial = !data && !error;
  const isLoadingMore =
    isLoadingInitial ||
    (size > 0 && !!data && typeof data[size - 1] === "undefined" && isValidating);
  const isEmpty = !isLoadingInitial && items.length === 0;
  const isReachingEnd =
    isEmpty ||
    (!!data && (data[data.length - 1]?.results?.length ?? 0) < 20) ||
    (!!data && !!data[data.length - 1]?.total_pages && size >= data[data.length - 1]!.total_pages!);

  const loadMore = useCallback(() => {
    setSize((current) => current + 1);
  }, [setSize]);

  useEffect(() => {
    if (!items.length) return;
    const missing = items
      .map(item => item.id)
      .filter(id => availabilityRef.current[id] === undefined);
    if (!missing.length) return;
    fetchAvailabilityBatched(type, missing)
      .then(next => {
        if (Object.keys(next).length) setAvailability(prev => ({ ...prev, ...next }));
      })
      .catch(() => { });
  }, [items, type, setAvailability]);

  // Use vertical scroll for infinite loading - matching Jellyseerr behavior
  const shouldFetch = !isLoadingMore && !isReachingEnd && !isLoadingInitial;
  useVerticalScroll(loadMore, shouldFetch, { triggerOnMount: false });

  const cards = useMemo(() => toCards(items, type, availability), [items, type, availability]);

  return (
    <div className="px-2 sm:px-4">
      {showTitle && <h1 className="text-2xl md:text-3xl font-bold mb-4">{title}</h1>}

      {isEmpty && (
        <div className="mt-32 w-full text-center text-sm text-gray-400">
          No results found. Adjust your filters and try again.
        </div>
      )}

      {/* Grid - 3 columns on mobile, auto-fill on larger screens */}
      <ul className="grid grid-cols-3 gap-2 sm:gap-4 sm:grid-cols-none sm:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {cards.map((m, index) => (
          <li key={`${m.id}-${index}`}>
            <HoverMediaCard
              id={m.id}
              title={m.title}
              posterUrl={m.poster}
              href={m.href}
              year={m.year}
              rating={m.rating}
              description={m.overview}
              mediaType={type}
              mediaStatus={m.mediaStatus}
              imagePriority={index < 12}
              imageLoading={index < 12 ? "eager" : "lazy"}
              imageFetchPriority={index < 12 ? "high" : "auto"}
            />
          </li>
        ))}
        {/* Loading placeholders */}
        {(isLoadingMore || isLoadingInitial) &&
          [...Array(20)].map((_, i) => (
            <li key={`placeholder-${i}`}>
              <CardPlaceholder />
            </li>
          ))}
      </ul>

      {/* End of list indicator */}
      {isReachingEnd && cards.length > 0 && (
        <div className="py-8 text-center text-sm text-gray-500">
          You have reached the end
        </div>
      )}
    </div>
  );
}
