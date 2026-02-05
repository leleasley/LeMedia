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
    
    // Get continue watching items
    const continueWatching = await getContinueWatching(jellyfinUserId);

    // Map to our format with TMDB data - take top 5
    const mapped = await Promise.all(
      continueWatching.slice(0, 5).map(async (item) => {
        const tmdbId = item.ProviderIds?.Tmdb ? parseInt(item.ProviderIds.Tmdb, 10) : null;
        let type: "movie" | "tv" | null = null;
        let posterPath: string | null = null;
        let name = item.Name;

        if (tmdbId) {
          try {
            if (item.Type === "Movie") {
              type = "movie";
              const movie = await getMovie(tmdbId);
              posterPath = tmdbImageUrl(movie?.poster_path, "w500", imageProxyEnabled);
              name = movie?.title || item.Name;
            } else if (item.Type === "Series") {
              type = "tv";
              const tv = await getTv(tmdbId);
              posterPath = tmdbImageUrl(tv?.poster_path, "w500", imageProxyEnabled);
              name = tv?.name || item.Name;
            }
          } catch (err) {
            console.error(`[Next to Watch] Failed to fetch TMDB data for ${tmdbId}:`, err);
          }
        }

        return {
          id: item.Id,
          name,
          type: item.Type,
          tmdbId,
          mediaType: type,
          posterPath,
          playedPercentage: item.UserData?.PlaybackPositionTicks 
            ? Math.round((item.UserData.PlaybackPositionTicks / (item.RunTimeTicks || 1)) * 100)
            : 0
        };
      })
    );

    return cacheableJsonResponseWithETag(req, {
      items: mapped.filter(item => item.mediaType && item.tmdbId)
    }, { maxAge: 120 }); // Cache for 2 minutes
  } catch (error) {
    console.error("[Next to Watch] Error:", error);
    return cacheableJsonResponseWithETag(req, {
      items: [],
      error: "Failed to fetch next to watch"
    }, { maxAge: 30 });
  }
}
