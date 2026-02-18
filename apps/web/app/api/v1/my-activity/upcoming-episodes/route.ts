import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserByUsername, upsertUser, listUserMediaList } from "@/db";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";
import { getTv, getTvSeason } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

type UpcomingEpisode = {
  seriesId: number;
  seriesName: string;
  seriesPoster: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  airDate: string;
  daysUntil: number;
};

async function resolveUserId() {
  const user = await requireUser();
  if (user instanceof Response) throw user;
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return dbUser.id;
  const created = await upsertUser(user.username, user.groups);
  return created.id;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId();
    
    // Get user's favorites and watchlist (TV shows only)
    const [favorites, watchlist] = await Promise.all([
      listUserMediaList({ userId, listType: "favorite", limit: 20 }),
      listUserMediaList({ userId, listType: "watchlist", limit: 20 })
    ]);

    const trackedShows = new Set<number>();
    for (const item of [...favorites, ...watchlist]) {
      if (item.media_type === "tv") {
        trackedShows.add(item.tmdb_id);
      }
    }

    if (trackedShows.size === 0) {
      return cacheableJsonResponseWithETag(req, {
        items: [],
        message: "No TV shows in favorites or watchlist"
      }, { maxAge: 300 });
    }

    const upcomingEpisodes: UpcomingEpisode[] = [];
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Check each tracked show for upcoming episodes
    await Promise.all(
      Array.from(trackedShows).slice(0, 15).map(async (tmdbId) => {
        try {
          const tvDetails = await getTv(tmdbId);
          if (!tvDetails || tvDetails.status === "Ended" || tvDetails.status === "Canceled") {
            return;
          }

          // Get the next season to air or current airing season
          const seasons = tvDetails.seasons?.filter((s: any) => 
            s.season_number > 0 && 
            s.air_date
          ) || [];

          for (const season of seasons.slice(-2)) { // Check last 2 seasons
            try {
              const seasonDetails = await getTvSeason(tmdbId, season.season_number);
              if (!seasonDetails?.episodes) continue;

              for (const episode of seasonDetails.episodes) {
                if (!episode.air_date) continue;
                
                const airDate = new Date(episode.air_date);
                
                // Only include episodes within the next week
                if (airDate >= now && airDate <= oneWeekFromNow) {
                  const daysUntil = Math.ceil((airDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  
                  upcomingEpisodes.push({
                    seriesId: tmdbId,
                    seriesName: tvDetails.name || "Unknown",
                    seriesPoster: tvDetails.poster_path,
                    seasonNumber: episode.season_number,
                    episodeNumber: episode.episode_number,
                    episodeName: episode.name || "TBA",
                    airDate: episode.air_date,
                    daysUntil
                  });
                }
              }
            } catch (err) {
              logger.debug(`[Upcoming Episodes] Failed to fetch season ${season.season_number} for show ${tmdbId}`);
            }
          }
        } catch (err) {
          logger.debug(`[Upcoming Episodes] Failed to fetch show ${tmdbId}`);
        }
      })
    );

    // Sort by air date (soonest first)
    upcomingEpisodes.sort((a, b) => a.airDate.localeCompare(b.airDate));

    return cacheableJsonResponseWithETag(req, {
      items: upcomingEpisodes.slice(0, 10)
    }, { maxAge: 3600 }); // Cache for 1 hour
  } catch (error) {
    if (error instanceof Response) return error;
    logger.error("[Upcoming Episodes] Error", error);
    return cacheableJsonResponseWithETag(req, {
      items: [],
      error: "Failed to fetch upcoming episodes"
    }, { maxAge: 60 });
  }
}
