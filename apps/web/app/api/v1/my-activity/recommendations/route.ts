import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { getPersonalizedRecommendations } from "@/lib/jellyfin-watch";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { getMovie, getTv, getMovieRecommendations, getTvRecommendations, tmdbImageUrl } from "@/lib/tmdb";

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
    console.error("[getRecentlyWatched] Error:", error);
    return [];
  }
};

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  // Get user's Jellyfin ID
  const dbUser = await getUserWithHash(user.username);
  const jellyfinUserId = dbUser?.jellyfin_user_id;

  if (!jellyfinUserId) {
    return cacheableJsonResponseWithETag(req, {
      items: [],
      message: "Jellyfin not linked"
    }, { maxAge: 60 });
  }

  try {
    const imageProxyEnabled = await getImageProxyEnabled();
    
    // Get both Jellyfin suggestions and TMDB recommendations based on watch history
    const [jellyfinItems, recentItems] = await Promise.all([
      getPersonalizedRecommendations(jellyfinUserId, 8),
      getRecentlyWatched(jellyfinUserId, 15)
    ]);

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
        console.error(`[Recommendations] TMDB recommendations failed for ${tmdbId}:`, err);
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
    }> = [];

    // Add Jellyfin items first
    for (const item of jellyfinItems) {
      const tmdbId = item.ProviderIds?.Tmdb ? parseInt(item.ProviderIds.Tmdb, 10) : null;
      if (!tmdbId) continue;
      
      const key = `${item.Type}-${tmdbId}`;
      if (seenIds.has(key)) continue;
      seenIds.add(key);

      let type: "movie" | "tv" | null = null;
      let posterPath: string | null = null;

      try {
        if (item.Type === "Movie") {
          type = "movie";
          const movie = await getMovie(tmdbId);
          posterPath = tmdbImageUrl(movie?.poster_path, "w500", imageProxyEnabled);
          allRecommendations.push({
            id: item.Id,
            name: movie?.title || item.Name,
            type: item.Type,
            tmdbId,
            mediaType: type,
            posterPath,
            backdropPath: null,
            year: movie?.release_date ? new Date(movie.release_date).getFullYear() : item.ProductionYear,
            source: "jellyfin"
          });
        } else if (item.Type === "Series") {
          type = "tv";
          const tv = await getTv(tmdbId);
          posterPath = tmdbImageUrl(tv?.poster_path, "w500", imageProxyEnabled);
          allRecommendations.push({
            id: item.Id,
            name: tv?.name || item.Name,
            type: item.Type,
            tmdbId,
            mediaType: type,
            posterPath,
            backdropPath: null,
            year: tv?.first_air_date ? new Date(tv.first_air_date).getFullYear() : item.ProductionYear,
            source: "jellyfin"
          });
        }
      } catch (err) {
        console.error(`[Recommendations] Failed to fetch TMDB data for ${tmdbId}:`, err);
      }
    }

    // Add TMDB recommendations
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
              backdropPath: null,
              year: movie.release_date ? new Date(movie.release_date).getFullYear() : undefined,
              source: "tmdb"
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
              backdropPath: null,
              year: tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : undefined,
              source: "tmdb"
            });
          }
        }
      } catch (err) {
        console.error(`[Recommendations] Failed to fetch TMDB rec ${rec.tmdbId}:`, err);
      }
    }

    // Shuffle TMDB recommendations to add variety, then combine with Jellyfin
    const shuffled = [...allRecommendations].sort(() => Math.random() - 0.5);
    
    // Return up to 30 recommendations for a fuller display
    const finalRecommendations = shuffled.slice(0, 30);

    return cacheableJsonResponseWithETag(req, {
      items: finalRecommendations
    }, { maxAge: 300 }); // Cache for 5 minutes (reduced for variety)
  } catch (error) {
    console.error("[Recommendations] Error:", error);
    return cacheableJsonResponseWithETag(req, {
      items: [],
      error: "Failed to fetch recommendations"
    }, { maxAge: 30 });
  }
}
