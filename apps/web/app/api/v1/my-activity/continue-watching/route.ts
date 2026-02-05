import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { getContinueWatching } from "@/lib/jellyfin-watch";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

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
    const items = await getContinueWatching(jellyfinUserId);
    const imageProxyEnabled = await getImageProxyEnabled();

    // Map Jellyfin items to our format and fetch TMDB data
    const mapped = await Promise.all(items.map(async (item) => {
      const tmdbId = item.ProviderIds?.Tmdb ? parseInt(item.ProviderIds.Tmdb, 10) : null;
      let type: "movie" | "tv" | null = null;
      let posterPath: string | null = null;

      // Fetch actual TMDB poster
      if (tmdbId) {
        try {
          if (item.Type === "Movie") {
            type = "movie";
            const movie = await getMovie(tmdbId);
            posterPath = tmdbImageUrl(movie?.poster_path, "w500", imageProxyEnabled);
          } else if (item.Type === "Episode" || item.Type === "Series") {
            type = "tv";
            // For episodes, we want the series TMDB ID
            const seriesTmdbId = item.SeriesId && item.ProviderIds?.Tmdb 
              ? parseInt(item.ProviderIds.Tmdb, 10) 
              : tmdbId;
            const tv = await getTv(seriesTmdbId);
            posterPath = tmdbImageUrl(tv?.poster_path, "w500", imageProxyEnabled);
          }
        } catch (err) {
          // Fallback to null poster if TMDB fetch fails
          console.error(`[Continue Watching] Failed to fetch TMDB data for ${tmdbId}:`, err);
        }
      }

      return {
        id: item.Id,
        name: item.Name,
        type: item.Type,
        tmdbId,
        mediaType: type,
        posterPath,
        backdropPath: null,
        playedPercentage: item.UserData?.PlayedPercentage ?? 0,
        seriesName: item.SeriesName,
        seasonNumber: item.ParentIndexNumber,
        episodeNumber: item.IndexNumber,
        year: item.ProductionYear,
        runTimeTicks: item.RunTimeTicks
      };
    }));

    return cacheableJsonResponseWithETag(req, {
      items: mapped.filter(item => item.tmdbId) // Only return items with TMDB IDs
    }, { maxAge: 120 }); // Cache for 2 minutes
  } catch (error) {
    console.error("[Continue Watching] Error:", error);
    return cacheableJsonResponseWithETag(req, {
      items: [],
      error: "Failed to fetch continue watching"
    }, { maxAge: 30 });
  }
}
