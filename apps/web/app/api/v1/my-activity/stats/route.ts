import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { getWatchStats } from "@/lib/jellyfin-watch";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  // Get user's Jellyfin ID
  const dbUser = await getUserWithHash(user.username);
  const jellyfinUserId = dbUser?.jellyfin_user_id;

  if (!jellyfinUserId) {
    return cacheableJsonResponseWithETag(req, {
      totalMoviesWatched: 0,
      totalEpisodesWatched: 0,
      totalSeriesWatched: 0,
      totalHoursWatched: 0,
      totalDaysWatched: 0,
      moviesThisWeek: 0,
      episodesThisWeek: 0,
      favoriteGenres: [],
      message: "Jellyfin not linked"
    }, { maxAge: 60 });
  }

  try {
    const stats = await getWatchStats(jellyfinUserId);

    return cacheableJsonResponseWithETag(req, stats, { maxAge: 300 }); // Cache for 5 minutes
  } catch (error) {
    console.error("[Watch Stats] Error:", error);
    return cacheableJsonResponseWithETag(req, {
      totalMoviesWatched: 0,
      totalEpisodesWatched: 0,
      totalSeriesWatched: 0,
      totalHoursWatched: 0,
      totalDaysWatched: 0,
      moviesThisWeek: 0,
      episodesThisWeek: 0,
      favoriteGenres: [],
      error: "Failed to fetch stats"
    }, { maxAge: 30 });
  }
}
