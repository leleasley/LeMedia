import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash, getUserTasteProfile } from "@/db";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { logger } from "@/lib/logger";
import {
  discoverMovies,
  discoverTv,
  getMovie,
  getMovieRecommendations,
  getTv,
  getTvRecommendations,
  tmdbImageUrl,
} from "@/lib/tmdb";

export const dynamic = "force-dynamic";

// In-app helper to fetch recently watched - duplicated from jellyfin-watch.ts getRecentlyWatched
const getRecentlyWatched = async (userId: string, limit = 10) => {
  // Using inline fetch since jellyfinFetch is not exported
  const { JELLYFIN_URL, JELLYFIN_API_KEY } = process.env;
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) return [];
  
  try {
    const url = new URL(JELLYFIN_URL);
    url.pathname = `/jellyfin/Users/${userId}/Items`;
    url.searchParams.set("api_key", JELLYFIN_API_KEY);
    url.searchParams.set("SortBy", "DatePlayed");
    url.searchParams.set("SortOrder", "Descending");
    url.searchParams.set("IncludeItemTypes", "Movie,Series,Episode");
    url.searchParams.set("Recursive", "true");
    url.searchParams.set("Fields", "ProviderIds");
    url.searchParams.set("Filters", "IsPlayed");
    url.searchParams.set("Limit", limit.toString());

    const response = await fetch(url.toString());
    const data = await response.json();
    return data?.Items || [];
  } catch (error) {
    logger.error("[getRecentlyWatched] Error", error);
    return [];
  }
};

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  // Get user's Jellyfin ID and taste profile
  const dbUser = await getUserWithHash(user.username);
  const jellyfinUserId = dbUser?.jellyfin_user_id;
  const userId = dbUser?.id;

  if (!jellyfinUserId || !userId) {
    return cacheableJsonResponseWithETag(req, {
      items: [],
      message: "Jellyfin not linked"
    }, { maxAge: 60 });
  }

  try {
    const imageProxyEnabled = await getImageProxyEnabled();

    const [tasteProfile, recentItems] = await Promise.all([
      getUserTasteProfile(userId).catch(() => null),
      getRecentlyWatched(jellyfinUserId, 15),
    ]);

    const genreMap = [
      { field: "genreScifi", label: "Sci-Fi", tmdbId: 878 },
      { field: "genreAction", label: "Action", tmdbId: 28 },
      { field: "genreComedy", label: "Comedy", tmdbId: 35 },
      { field: "genreDrama", label: "Drama", tmdbId: 18 },
      { field: "genreHorror", label: "Horror", tmdbId: 27 },
      { field: "genreRomance", label: "Romance", tmdbId: 10749 },
      { field: "genreThriller", label: "Thriller", tmdbId: 53 },
      { field: "genreFantasy", label: "Fantasy", tmdbId: 14 },
      { field: "genreAnimation", label: "Animation", tmdbId: 16 },
      { field: "genreDocumentary", label: "Documentary", tmdbId: 99 },
      { field: "genreMystery", label: "Mystery", tmdbId: 9648 },
      { field: "genreCrime", label: "Crime", tmdbId: 80 },
    ];

    const weightedGenres = tasteProfile
      ? genreMap
          .map((genre) => ({
            ...genre,
            weight: Number((tasteProfile as any)[genre.field] ?? 0),
          }))
          .filter((genre) => genre.weight >= 3)
          .sort((a, b) => b.weight - a.weight)
      : [];

    const topGenre = weightedGenres[0];
    const minRating = tasteProfile?.minRating ?? 6.5;
    const preferMovies = tasteProfile?.preferMovies ?? 3;
    const preferTv = tasteProfile?.preferTv ?? 3;
    const preferMoviesOnly = preferMovies - preferTv >= 2;
    const preferTvOnly = preferTv - preferMovies >= 2;
    const reasoningBase = topGenre ? `Based on your love of ${topGenre.label}` : "Recommended for you";

    const discoveryParams: Record<string, string | number | boolean | undefined> = {
      sort_by: "popularity.desc",
      "vote_average.gte": minRating,
      "vote_count.gte": 50,
    };

    if (topGenre) {
      discoveryParams.with_genres = topGenre.tmdbId;
    }

    // Get TMDB recommendations based on recently watched - fetch more items
    const tmdbRecommendations: Array<{ tmdbId: number; type: "movie" | "tv" }> = [];
    
    // Process all recent items in parallel for speed
    const recentPromises = recentItems.slice(0, 10).map(async (recent: { ProviderIds?: { Tmdb?: string }; Type?: string }) => {
      const tmdbId = recent.ProviderIds?.Tmdb ? parseInt(recent.ProviderIds.Tmdb, 10) : null;
      if (!tmdbId) return [];
      
      try {
        if (recent.Type === "Movie") {
          const recs = await getMovieRecommendations(tmdbId);
          if (Array.isArray(recs?.results)) {
            return recs.results.slice(0, 5).map((rec: { id: number }) => ({ tmdbId: rec.id, type: "movie" as const }));
          }
        } else if (recent.Type === "Episode" || recent.Type === "Series") {
          const recs = await getTvRecommendations(tmdbId);
          if (Array.isArray(recs?.results)) {
            return recs.results.slice(0, 5).map((rec: { id: number }) => ({ tmdbId: rec.id, type: "tv" as const }));
          }
        }
      } catch (err) {
        logger.error(`[Recommendations] TMDB recommendations failed for ${tmdbId}`, err);
      }
      return [];
    });

    const recentResults = await Promise.all(recentPromises);
    for (const results of recentResults) {
      tmdbRecommendations.push(...results);
    }

    // Combine and deduplicate recommendations
    const seenIds = new Set<string>();
    const allRecommendations: Array<{
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
    }> = [];

    const discoverPromises: Array<Promise<any>> = [];
    if (!preferTvOnly) {
      discoverPromises.push(discoverMovies(discoveryParams, 1));
    }
    if (!preferMoviesOnly) {
      discoverPromises.push(discoverTv(discoveryParams, 1));
    }

    if (discoverPromises.length > 0) {
      const discoverResults = await Promise.all(discoverPromises);
      for (const result of discoverResults) {
        const items = Array.isArray(result?.results) ? result.results : [];
        for (const item of items) {
          const isMovie = Boolean(item?.title);
          const tmdbId = item?.id ? Number(item.id) : null;
          if (!tmdbId) continue;
          const key = `${isMovie ? "Movie" : "Series"}-${tmdbId}`;
          if (seenIds.has(key)) continue;
          seenIds.add(key);

          allRecommendations.push({
            id: `tmdb-${isMovie ? "movie" : "tv"}-${tmdbId}`,
            name: isMovie ? item.title ?? "" : item.name ?? "",
            type: isMovie ? "Movie" : "Series",
            tmdbId,
            mediaType: isMovie ? "movie" : "tv",
            posterPath: tmdbImageUrl(item.poster_path, "w500", imageProxyEnabled),
            backdropPath: tmdbImageUrl(item.backdrop_path, "w780", imageProxyEnabled),
            year: item.release_date ? new Date(item.release_date).getFullYear() : item.first_air_date ? new Date(item.first_air_date).getFullYear() : undefined,
            source: "tmdb",
            reasoning: reasoningBase,
          });
        }
      }
    }

    const fallbackReasoning = topGenre ? reasoningBase : "Based on your recent watches";

    for (const rec of tmdbRecommendations) {
      const key = `${rec.type}-${rec.tmdbId}`;
      if (seenIds.has(key)) continue;
      seenIds.add(key);

      try {
        if (rec.type === "movie") {
          const movie = await getMovie(rec.tmdbId);
          if (movie) {
            allRecommendations.push({
              id: `tmdb-movie-${rec.tmdbId}`,
              name: movie.title || "",
              type: "Movie",
              tmdbId: rec.tmdbId,
              mediaType: "movie",
              posterPath: tmdbImageUrl(movie.poster_path, "w500", imageProxyEnabled),
              backdropPath: tmdbImageUrl(movie.backdrop_path, "w780", imageProxyEnabled),
              year: movie.release_date ? new Date(movie.release_date).getFullYear() : undefined,
              source: "tmdb",
              reasoning: fallbackReasoning,
            });
          }
        } else {
          const tv = await getTv(rec.tmdbId);
          if (tv) {
            allRecommendations.push({
              id: `tmdb-tv-${rec.tmdbId}`,
              name: tv.name || "",
              type: "Series",
              tmdbId: rec.tmdbId,
              mediaType: "tv",
              posterPath: tmdbImageUrl(tv.poster_path, "w500", imageProxyEnabled),
              backdropPath: tmdbImageUrl(tv.backdrop_path, "w780", imageProxyEnabled),
              year: tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : undefined,
              source: "tmdb",
              reasoning: fallbackReasoning,
            });
          }
        }
      } catch (err) {
        logger.error(`[Recommendations] Failed to fetch TMDB rec ${rec.tmdbId}`, err);
      }
    }

    const finalRecommendations = allRecommendations.slice(0, 6);

    return cacheableJsonResponseWithETag(req, {
      items: finalRecommendations
    }, { maxAge: 300 }); // Cache for 5 minutes
  } catch (error) {
    logger.error("[Recommendations] Error", error);
    return cacheableJsonResponseWithETag(req, {
      items: [],
      error: "Failed to fetch recommendations"
    }, { maxAge: 30 });
  }
}
