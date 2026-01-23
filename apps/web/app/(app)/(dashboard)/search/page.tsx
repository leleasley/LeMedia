import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import { PersonCard } from "@/components/Media/PersonCard";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { searchMulti, tmdbImageUrl } from "@/lib/tmdb";
import { getAvailabilityStatusByTmdbIds } from "@/lib/library-availability";
import { availabilityToMediaStatus } from "@/lib/media-status";
import { z } from "zod";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { EnhancedSearchFilters } from "@/components/Search/EnhancedSearchClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Q = z.string().optional();
const Type = z.enum(["all", "movie", "tv"]).optional();

type SearchParams =
  | Promise<{ q?: string | string[]; type?: string | string[] } | ReadonlyURLSearchParams | undefined>
  | { q?: string | string[]; type?: string | string[] }
  | ReadonlyURLSearchParams
  | undefined;

function resolveSearchParams(params?: SearchParams) {
  if (params && typeof params === "object" && "then" in params) {
    return params;
  }
  return Promise.resolve(params);
}

function extractQuery(params?: { q?: string | string[] } | ReadonlyURLSearchParams) {
  if (!params) return "";
  if ("get" in params && typeof params.get === "function") {
    return params.get("q") ?? "";
  }
  const raw = (params as { q?: string | string[] }).q;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

function extractType(params?: { type?: string | string[] } | ReadonlyURLSearchParams) {
  if (!params) return "all";
  if ("get" in params && typeof params.get === "function") {
    return params.get("type") ?? "all";
  }
  const raw = (params as { type?: string | string[] }).type;
  if (Array.isArray(raw)) return raw[0] ?? "all";
  return raw ?? "all";
}

function filterByType(items: any[], type: "all" | "movie" | "tv") {
  if (type === "all") return items;
  return items.filter((r: any) => r?.media_type === type);
}

function applyAdvancedFilters(
  items: any[], 
  yearMin?: string, 
  yearMax?: string, 
  ratingMin?: string, 
  ratingMax?: string, 
  genres?: string
) {
  let filtered = items;
  
  if (yearMin || yearMax) {
    const minYear = yearMin ? parseInt(yearMin) : 0;
    const maxYear = yearMax ? parseInt(yearMax) : 9999;
    filtered = filtered.filter((item: any) => {
      const year = parseInt((item.release_date || item.first_air_date || "").slice(0, 4));
      return year >= minYear && year <= maxYear;
    });
  }
  
  if (ratingMin || ratingMax) {
    const minRating = ratingMin ? parseFloat(ratingMin) : 0;
    const maxRating = ratingMax ? parseFloat(ratingMax) : 10;
    filtered = filtered.filter((item: any) => {
      const rating = item.vote_average || 0;
      return rating >= minRating && rating <= maxRating;
    });
  }
  
  if (genres) {
    const genreIds = genres.split(",").map(Number);
    filtered = filtered.filter((item: any) => {
      const itemGenres = item.genre_ids || [];
      return genreIds.some((g: number) => itemGenres.includes(g));
    });
  }
  
  return filtered;
}

export default async function SearchPage({ searchParams }: { searchParams?: SearchParams }) {
  const imageProxyEnabled = await getImageProxyEnabled();
  const resolved = await resolveSearchParams(searchParams);
  const normalizedQ = extractQuery(resolved);
  const normalizedType = extractType(resolved);
  const query = (Q.parse(normalizedQ) ?? "").trim();
  const type = (Type.parse(normalizedType) ?? "all") as "all" | "movie" | "tv";

  // Get filter params
  const yearMin = resolved && "get" in resolved ? resolved.get("year_min") : undefined;
  const yearMax = resolved && "get" in resolved ? resolved.get("year_max") : undefined;
  const ratingMin = resolved && "get" in resolved ? resolved.get("rating_min") : undefined;
  const ratingMax = resolved && "get" in resolved ? resolved.get("rating_max") : undefined;
  const genres = resolved && "get" in resolved ? resolved.get("genres") : undefined;

  const results = query ? await searchMulti(query, 1) : null;
  let filteredResults = results ? filterByType((results as any)?.results ?? [], type) : [];
  
  // Apply advanced filters
  if (yearMin || yearMax || ratingMin || ratingMax || genres) {
    filteredResults = applyAdvancedFilters(filteredResults, yearMin ?? undefined, yearMax ?? undefined, ratingMin ?? undefined, ratingMax ?? undefined, genres ?? undefined);
  }
  const movieIds = filteredResults.filter((r: any) => r?.media_type === "movie").map((r: any) => r.id);
  const tvIds = filteredResults.filter((r: any) => r?.media_type === "tv").map((r: any) => r.id);
  const [movieAvailability, tvAvailability]: [Record<number, any>, Record<number, any>] = await Promise.all([
    movieIds.length ? getAvailabilityStatusByTmdbIds("movie", movieIds) : Promise.resolve({} as Record<number, any>),
    tvIds.length ? getAvailabilityStatusByTmdbIds("tv", tvIds) : Promise.resolve({} as Record<number, any>)
  ]);

  return (
    <div className="space-y-4 md:space-y-8 px-3 md:px-8 pb-4 md:pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Search Results</h1>
        {query && (
          <p className="text-sm md:text-base text-foreground/70 mt-2">
            {filteredResults.length > 0 ? `Found ${filteredResults.length} result${filteredResults.length !== 1 ? 's' : ''} for "${query}"` : `No results found for "${query}"`}
          </p>
        )}
      </div>

      {query && <EnhancedSearchFilters />}

      {query && filteredResults.length > 0 && (
        <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredResults.map((r: any) => {
            // Handle person results
            if (r.media_type === "person") {
              return (
                <PersonCard
                  key={`person-${r.id}`}
                  id={r.id}
                  name={r.name ?? "Unknown"}
                  profilePath={r.profile_path}
                  knownForDepartment={r.known_for_department}
                  imageProxyEnabled={imageProxyEnabled}
                />
              );
            }

            // Handle movie/TV results
            const title = r.title ?? r.name ?? "Untitled";
            const mediaType = r.media_type === "movie" ? "movie" : "tv";
            const year = (r.release_date ?? r.first_air_date ?? "").slice(0, 4);
            const rating = r.vote_average ?? 0;
            const poster = tmdbImageUrl(r.poster_path, "w500", imageProxyEnabled);
            const href = mediaType === "movie" ? `/movie/${r.id}` : `/tv/${r.id}`;
            const availabilityStatus = mediaType === "movie"
              ? movieAvailability[r.id]
              : tvAvailability[r.id];
            const mediaStatus = availabilityToMediaStatus(availabilityStatus);

            return (
              <HoverMediaCard
                key={`${mediaType}-${r.id}`}
                id={r.id}
                title={title}
                posterUrl={poster}
                href={href}
                year={year}
                rating={rating}
                description={r.overview}
                mediaType={mediaType}
                mediaStatus={mediaStatus}
              />
            );
          })}
        </div>
      )}

      {query && filteredResults.length === 0 && (
        <div className="rounded-lg md:rounded-2xl glass-strong p-8 md:p-12 text-center">
          <p className="text-base md:text-lg text-foreground/70">No results found for &quot;{query}&quot;</p>
          <p className="text-xs md:text-sm text-foreground/50 mt-2">Try a different search term</p>
        </div>
      )}

      {!query && (
        <div className="rounded-lg md:rounded-2xl glass-strong p-8 md:p-12 text-center">
          <p className="text-base md:text-lg text-foreground/70">Start typing in the search bar to find movies and TV shows</p>
        </div>
      )}
    </div>
  );
}
