"use client";

import { DiscoverFilterBar, DiscoverFiltersState } from "@/components/Discover/DiscoverFilterBar";
import { MediaGrid } from "@/components/Media/MediaGrid";
import { buildDiscoverSearchParams, parseDiscoverFilters } from "@/lib/discover-filters";
import { createTmdbListFetcher } from "@/lib/tmdb-client";
import type { MediaGridPage } from "@/types/media-grid";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function MoviesPageClient({ initialData }: { initialData?: MediaGridPage[] | null }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const filters = useMemo(
    () => parseDiscoverFilters(searchParams, "movie"),
    [searchParams]
  );

  const handleFilterChange = useCallback((nextFilters: DiscoverFiltersState) => {
    const nextParams = buildDiscoverSearchParams(nextFilters, "movie");
    const next = nextParams.toString();
    const current = searchParams.toString();
    if (next === current) return;
    const url = next ? `${pathname}?${next}` : pathname;
    router.replace(url, { scroll: false });
  }, [pathname, router, searchParams]);

  const discoverParams = useMemo(() => {
    const params: Record<string, string> = {};
    switch (filters.sort) {
      case "popularity_asc":
        params.sort_by = "popularity.asc";
        break;
      case "release_desc":
        params.sort_by = "release_date.desc";
        break;
      case "release_asc":
        params.sort_by = "release_date.asc";
        break;
      case "rating_desc":
        params.sort_by = "vote_average.desc";
        break;
      case "rating_asc":
        params.sort_by = "vote_average.asc";
        break;
      case "title_asc":
        params.sort_by = "original_title.asc";
        break;
      case "title_desc":
        params.sort_by = "original_title.desc";
        break;
      case "recently_added":
        params.sort_by = "primary_release_date.desc";
        break;
      case "popularity_desc":
      default:
        break;
    }
    if (filters.genres.length) params.with_genres = filters.genres.join(",");
    if (filters.releaseFrom) params["primary_release_date.gte"] = filters.releaseFrom;
    if (filters.releaseTo) params["primary_release_date.lte"] = filters.releaseTo;
    if (filters.language) params.with_original_language = filters.language;
    if (filters.providers.length) params.with_watch_providers = filters.providers.join("|");
    if ((filters.providers.length || filters.monetization) && filters.watchRegion) params.watch_region = filters.watchRegion;
    if (filters.monetization) params.with_watch_monetization_types = filters.monetization;
    if (filters.studio) params.with_companies = String(filters.studio.id);
    if (filters.runtimeMin) params["with_runtime.gte"] = filters.runtimeMin;
    if (filters.runtimeMax) params["with_runtime.lte"] = filters.runtimeMax;
    if (filters.ratingMin) params["vote_average.gte"] = filters.ratingMin;
    if (filters.ratingMax) params["vote_average.lte"] = filters.ratingMax;
    if (filters.voteCountMin) params["vote_count.gte"] = filters.voteCountMin;
    else if ((filters.sort === "rating_desc" || filters.sort === "rating_asc") && !filters.voteCountMax) params["vote_count.gte"] = "200";
    if (filters.voteCountMax) params["vote_count.lte"] = filters.voteCountMax;
    if (filters.keywords) params.with_keywords = filters.keywords.split(/[,\s]+/).filter(Boolean).join(",");
    if (filters.excludeKeywords) params.without_keywords = filters.excludeKeywords.split(/[,\s]+/).filter(Boolean).join(",");
    return params;
  }, [filters]);

  return (
    <div className="pb-4 md:pb-8">
      <DiscoverFilterBar type="movie" title="Movies" filters={filters} onChange={handleFilterChange} />
      <MediaGrid
        fetcher={createTmdbListFetcher("/api/tmdb/discover/movie")}
        type="movie"
        title="Movies"
        showTitle={false}
        filters={discoverParams}
        initialPageCount={3}
        initialData={initialData ?? undefined}
      />
    </div>
  );
}
