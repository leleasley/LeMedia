import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { discoverMovies, discoverTv, getMovie, getTv, findTvByTvdbId, getTvSeasonEpisodes } from "@/lib/tmdb";
import { getPool, getCalendarFeedUserByToken } from "@/db";
import { getSonarrCalendar } from "@/lib/sonarr";
import { getRadarrCalendar } from "@/lib/radarr";
import { findAvailableMovieByName, findAvailableMovieByTmdb, findAvailableSeriesByIds, isEpisodeAvailable } from "@/lib/jellyfin";
import { getCachedEpisodeAvailability } from "@/lib/jellyfin-availability-sync";
import { deduplicateFetch } from "@/lib/request-cache";
import { logger } from "@/lib/logger";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "movie_release" | "tv_premiere" | "tv_episode" | "season_premiere"
        | "request_pending" | "request_approved"
        | "sonarr_monitored" | "radarr_monitored";
  tmdbId?: number;
  tvdbId?: number;
  posterPath?: string | null;
  backdropPath?: string | null;
  mediaType?: "movie" | "tv";
  metadata?: {
    overview?: string;
    voteAverage?: number;
    genres?: { id: number; name: string }[];
    episodeNumber?: number;
    seasonNumber?: number;
    monitored?: boolean;
    isAvailable?: boolean;
    jellyfinItemId?: string | null;
    sonarrSeriesId?: number;
    sonarrEpisodeId?: number;
    tvdbEpisodeId?: number;
    seriesType?: string;
    tmdbEpisodeId?: number;
    radarrMovieId?: number;
    requestId?: string;
    status?: string;
    baseTitle?: string;
  };
}

// Cache configuration
const CACHE_TTL_TMDB = 5 * 60 * 1000; // 5 minutes for TMDB releases
const CACHE_TTL_SONARR_RADARR = 5 * 60 * 1000; // 5 minutes for Sonarr/Radarr
const CACHE_TTL_SEASON_PREMIERES = 24 * 60 * 60 * 1000; // 24 hours for season data
const CACHE_TTL_JELLYFIN = 10 * 60 * 1000; // 10 minutes for Jellyfin availability
const CACHE_TTL_DB = 60 * 1000; // 1 minute for DB-backed calendar data

async function fetchTvMetadata(tmdbIds: Set<number>, tvdbIds: Set<number>) {
  const tvdbToTmdb = new Map<number, number>();

  if (tvdbIds.size > 0) {
    await Promise.all(
      Array.from(tvdbIds).map(async (tvdbId) => {
        try {
          const findResult = await deduplicateFetch(
            `tmdb-find-tvdb:${tvdbId}`,
            () => findTvByTvdbId(tvdbId),
            { ttl: CACHE_TTL_TMDB }
          );
          const matchedTmdb = findResult?.tv_results?.[0]?.id;
          if (matchedTmdb) {
            tvdbToTmdb.set(tvdbId, matchedTmdb);
            tmdbIds.add(matchedTmdb);
          }
        } catch (error) {
          console.error(`[Calendar] Error resolving TMDB ID for TVDB ${tvdbId}:`, error);
        }
      })
    );
  }

  const metadataEntries = await Promise.all(
    Array.from(tmdbIds).map(async (tmdbId) => {
      try {
        const show = await deduplicateFetch(
          `tmdb-tv:${tmdbId}`,
          () => getTv(tmdbId),
          { ttl: CACHE_TTL_TMDB }
        );
        return { tmdbId, show };
      } catch (error) {
        console.error(`[Calendar] Error fetching TMDB TV metadata for ${tmdbId}:`, error);
        return { tmdbId, show: null };
      }
    })
  );

  const metadataMap = new Map<number, any>();
  metadataEntries.forEach(({ tmdbId, show }) => {
    if (show) metadataMap.set(tmdbId, show);
  });

  return { metadataMap, tvdbToTmdb };
}

async function fetchMovieMetadata(tmdbIds: Set<number>) {
  const metadataEntries = await Promise.all(
    Array.from(tmdbIds).map(async (tmdbId) => {
      try {
        const movie = await deduplicateFetch(
          `tmdb-movie:${tmdbId}`,
          () => getMovie(tmdbId),
          { ttl: CACHE_TTL_TMDB }
        );
        return { tmdbId, movie };
      } catch (error) {
        console.error(`[Calendar] Error fetching TMDB movie metadata for ${tmdbId}:`, error);
        return { tmdbId, movie: null };
      }
    })
  );

  const metadataMap = new Map<number, any>();
  metadataEntries.forEach(({ tmdbId, movie }) => {
    if (movie) metadataMap.set(tmdbId, movie);
  });

  return metadataMap;
}

/**
 * Get TMDB releases (movies and TV premieres) in date range
 */
async function getTmdbReleasesInRange(start: string, end: string): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];

  try {
    const [movies, tvShows] = await Promise.all([
      deduplicateFetch(
        `tmdb-movies:${start}:${end}`,
        () => discoverMovies({
          "primary_release_date.gte": start,
          "primary_release_date.lte": end,
          with_release_type: "2|3|4", // Theatrical, Digital
          sort_by: "popularity.desc"
        }),
        { ttl: CACHE_TTL_TMDB }
      ),
      deduplicateFetch(
        `tmdb-tv:${start}:${end}`,
        () => discoverTv({
          "first_air_date.gte": start,
          "first_air_date.lte": end,
          sort_by: "popularity.desc"
        }),
        { ttl: CACHE_TTL_TMDB }
      )
    ]);

    if (movies?.results) {
      movies.results.forEach((movie: any) => {
        if (!movie.release_date) return;
        events.push({
          id: `movie-${movie.id}`,
          title: movie.title || "Untitled",
          date: movie.release_date,
          type: "movie_release",
          tmdbId: movie.id,
          posterPath: movie.poster_path,
          backdropPath: movie.backdrop_path,
          mediaType: "movie",
          metadata: {
            overview: movie.overview,
            voteAverage: movie.vote_average,
            genres: movie.genre_ids ? movie.genre_ids.map((id: number) => ({ id, name: "" })) : []
          }
        });
      });
    }

    if (tvShows?.results) {
      tvShows.results.forEach((show: any) => {
        if (!show.first_air_date) return;
        events.push({
          id: `tv-${show.id}`,
          title: show.name || "Untitled",
          date: show.first_air_date,
          type: "tv_premiere",
          tmdbId: show.id,
          posterPath: show.poster_path,
          backdropPath: show.backdrop_path,
          mediaType: "tv",
          metadata: {
            overview: show.overview,
            voteAverage: show.vote_average,
            genres: show.genre_ids ? show.genre_ids.map((id: number) => ({ id, name: "" })) : []
          }
        });
      });
    }
  } catch (error) {
    console.error("[Calendar] Error fetching TMDB releases:", error);
  }

  return events;
}

/**
 * Get Sonarr calendar events (monitored TV episodes)
 */
async function getSonarrCalendarEvents(start: string, end: string): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  const tmdbIds = new Set<number>();
  const tvdbIds = new Set<number>();

  try {
    const sonarrEpisodes = await deduplicateFetch(
      `sonarr-calendar:${start}:${end}`,
      () => getSonarrCalendar(start, end, false),
      { ttl: CACHE_TTL_SONARR_RADARR }
    );

    if (Array.isArray(sonarrEpisodes)) {
      sonarrEpisodes.forEach((episode: any) => {
        if (!episode.airDateUtc) return;

        const airDate = episode.airDateUtc.split('T')[0]; // Extract date portion
        const series = episode.series || {};
        const tmdbId = series.tmdbId || episode.tmdbId || undefined;
        const tvdbId = series.tvdbId || episode.tvdbId || undefined;
        if (tmdbId) tmdbIds.add(tmdbId);
        else if (tvdbId) tvdbIds.add(tvdbId);
        const seasonNumber = episode.seasonNumber ?? 0;
        const episodeNumber = episode.episodeNumber ?? 0;
        // Extract episode TVDB ID - Sonarr uses 'tvdbId' field for episode IDs in calendar
        const tvdbEpisodeId = episode.tvdbId || undefined;
        const seriesType = series.seriesType || series.series_type || series.type;
        const baseSeriesTitle =
          series.title ||
          series.cleanTitle ||
          episode.seriesTitle ||
          episode.title ||
          "Unknown Series";
        const posterPath =
          series.images?.find((img: any) => img.coverType === "poster")?.remoteUrl ??
          episode.images?.find((img: any) => img.coverType === "poster")?.remoteUrl ??
          null;
        const backdropPath =
          series.images?.find((img: any) => img.coverType === "fanart")?.remoteUrl ??
          episode.images?.find((img: any) => img.coverType === "fanart")?.remoteUrl ??
          null;

        const event: CalendarEvent = {
          id: `sonarr-${episode.id}`,
          title: `${baseSeriesTitle} - S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`,
          date: airDate,
          type: "sonarr_monitored",
          tmdbId,
          tvdbId,
          posterPath,
          backdropPath,
          mediaType: "tv",
          metadata: {
            overview: episode.overview,
            episodeNumber,
            seasonNumber,
            monitored: episode.monitored,
            sonarrSeriesId: episode.seriesId,
            sonarrEpisodeId: episode.id,
            tvdbEpisodeId,
            seriesType,
            baseTitle: baseSeriesTitle
          }
        };

        events.push(event);
      });

      // Enrich Sonarr items with TMDB metadata for proper titles/posters
      const { metadataMap, tvdbToTmdb } = await fetchTvMetadata(tmdbIds, tvdbIds);

      events.forEach((event) => {
        const resolvedTmdbId = event.tmdbId ?? (event.tvdbId ? tvdbToTmdb.get(event.tvdbId) : undefined);
        if (!resolvedTmdbId) return;

        const show = metadataMap.get(resolvedTmdbId);
        if (!show) return;

        const seasonNumber = event.metadata?.seasonNumber ?? 0;
        const episodeNumber = event.metadata?.episodeNumber ?? 0;
        const seriesTitle = show.name || show.original_name || event.title;

        event.tmdbId = resolvedTmdbId;
        event.posterPath = show.poster_path ?? event.posterPath;
        event.backdropPath = show.backdrop_path ?? event.backdropPath;
        event.mediaType = "tv";
        event.title = `${seriesTitle} - S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
        event.metadata = {
          ...event.metadata,
          overview: event.metadata?.overview || show.overview,
          voteAverage: event.metadata?.voteAverage ?? show.vote_average,
          genres: show.genres
        };
      });
    }
  } catch (error) {
    console.error("[Calendar] Error fetching Sonarr calendar:", error);
    // Non-fatal: continue without Sonarr events
  }

  return events;
}

/**
 * Get Radarr calendar events (monitored movies)
 */
async function getRadarrCalendarEvents(start: string, end: string): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  const tmdbIds = new Set<number>();

  try {
    const radarrMovies = await deduplicateFetch(
      `radarr-calendar:${start}:${end}`,
      () => getRadarrCalendar(start, end, false),
      { ttl: CACHE_TTL_SONARR_RADARR }
    );

    if (Array.isArray(radarrMovies)) {
      radarrMovies.forEach((movie: any) => {
        const releaseDate = movie.digitalRelease || movie.physicalRelease || movie.inCinemas;
        const addedDate =
          (movie.hasFile && movie.movieFile?.dateAdded) ||
          (movie.added && movie.status === "released" ? movie.added : null);
        const dateSource = addedDate || releaseDate;
        if (!dateSource) return;

        const date = String(dateSource).split('T')[0]; // Extract date portion
        if (movie.tmdbId) tmdbIds.add(movie.tmdbId);

        events.push({
          id: `radarr-${movie.id}`,
          title: movie.title || "Untitled",
          date,
          type: "radarr_monitored",
          tmdbId: movie.tmdbId,
          posterPath: null, // Radarr uses different image system
          backdropPath: null,
          mediaType: "movie",
          metadata: {
            overview: movie.overview,
            monitored: movie.monitored,
            radarrMovieId: movie.id,
            voteAverage: movie.ratings?.tmdb?.value
          }
        });
      });

      const metadataMap = await fetchMovieMetadata(tmdbIds);

      events.forEach((event) => {
        if (!event.tmdbId) return;
        const movie = metadataMap.get(event.tmdbId);
        if (!movie) return;

        event.title = movie.title || movie.original_title || event.title;
        event.posterPath = movie.poster_path ?? event.posterPath;
        event.backdropPath = movie.backdrop_path ?? event.backdropPath;
        event.mediaType = "movie";
        event.metadata = {
          ...event.metadata,
          overview: event.metadata?.overview || movie.overview,
          voteAverage: event.metadata?.voteAverage ?? movie.vote_average,
          genres: movie.genres
        };
      });
    }
  } catch (error) {
    console.error("[Calendar] Error fetching Radarr calendar:", error);
    // Non-fatal: continue without Radarr events
  }

  return events;
}

/**
 * Get season premieres for user's watchlisted TV shows
 */
async function getSeasonPremieres(userId: number, start: string, end: string): Promise<CalendarEvent[]> {
  const pool = getPool();
  const events: CalendarEvent[] = [];

  try {
    // Get user's watchlisted TV shows
    const result = await deduplicateFetch(
      `calendar-watchlist:${userId}`,
      () =>
        pool
          .query(
            `
      SELECT tmdb_id
      FROM user_media_list
      WHERE user_id = $1 AND media_type = 'tv' AND list_type = 'watchlist'
    `,
            [userId]
          )
          .then((queryResult) => queryResult),
      { ttl: CACHE_TTL_DB }
    );

    // For each show, check for new seasons airing in date range
    const showPromises = result.rows.map(async (row: any) => {
      try {
        const tmdbId = row.tmdb_id;
        const show = await deduplicateFetch(
          `tv-${tmdbId}`,
          () => getTv(tmdbId),
          { ttl: CACHE_TTL_SEASON_PREMIERES }
        );

        if (!show?.seasons) return [];

        const seasonEvents: CalendarEvent[] = [];

        // Find seasons premiering in date range
        for (const season of show.seasons) {
          if (season.season_number === 0) continue; // Skip specials
          if (!season.air_date) continue;

          const airDate = season.air_date;
          if (airDate >= start && airDate <= end) {
            seasonEvents.push({
              id: `season-premiere-${tmdbId}-${season.season_number}`,
              title: `${show.name} - Season ${season.season_number} Premiere`,
              date: airDate,
              type: "season_premiere",
              tmdbId,
              posterPath: season.poster_path || show.poster_path,
              backdropPath: show.backdrop_path,
              mediaType: "tv",
              metadata: {
                overview: season.overview || show.overview,
                seasonNumber: season.season_number,
                episodeNumber: 1,
                voteAverage: show.vote_average,
                genres: show.genres
              }
            });
          }
        }

        return seasonEvents;
      } catch (error) {
        console.error(`[Calendar] Error fetching season data for TMDB ${row.tmdb_id}:`, error);
        return [];
      }
    });

    const allSeasonEvents = await Promise.all(showPromises);
    events.push(...allSeasonEvents.flat());
  } catch (error) {
    console.error("[Calendar] Error fetching season premieres:", error);
  }

  return events;
}

/**
 * Get user's requests with actual release dates (not just created_at)
 */
async function getRequestsWithReleaseDate(userId: number): Promise<CalendarEvent[]> {
  const pool = getPool();
  const events: CalendarEvent[] = [];

  try {
    const result = await deduplicateFetch(
      `calendar-requests:${userId}`,
      () =>
        pool
          .query(
            `
      SELECT
        mr.id,
        mr.tmdb_id,
        mr.title,
        mr.request_type,
        mr.poster_path,
        mr.created_at,
        mr.status
      FROM media_request mr
      WHERE mr.requested_by = $1
        AND mr.status IN ('pending', 'approved', 'submitted')
      ORDER BY mr.created_at DESC
      LIMIT 50
    `,
            [userId]
          )
          .then((queryResult) => queryResult),
      { ttl: CACHE_TTL_DB }
    );

    result.rows.forEach((row: any) => {
      // Use created_at as the display date
      const displayDate = row.created_at.split('T')[0];

      events.push({
        id: `request-${row.id}`,
        title: row.title,
        date: displayDate,
        type: row.status === 'approved' || row.status === 'submitted' ? 'request_approved' : 'request_pending',
        tmdbId: row.tmdb_id,
        posterPath: row.poster_path,
        mediaType: row.request_type === 'movie' ? 'movie' : 'tv',
        metadata: {
          requestId: row.id,
          status: row.status
        }
      });
    });
  } catch (error) {
    console.error("[Calendar] Error fetching requests:", error);
  }

  return events;
}

/**
 * Enrich events with Jellyfin availability status
 */
async function enrichWithJellyfinAvailability(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  const batchSize = 10;
  const episodeAvailabilityCache = new Map<
    string,
    Promise<{
      byEpisode: Map<number, { available: boolean; jellyfinItemId: string | null }>;
      byAirDate: Map<string, { available: boolean; jellyfinItemId: string | null }>;
    }>
  >();

  const getCachedAvailability = (tmdbId: number, seasonNumber: number, tvdbId?: number) => {
    const key = `${tmdbId}:${seasonNumber}:${tvdbId ?? ""}`;
    if (!episodeAvailabilityCache.has(key)) {
      episodeAvailabilityCache.set(key, getCachedEpisodeAvailability(tmdbId, seasonNumber, tvdbId));
    }
    return episodeAvailabilityCache.get(key)!;
  };

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (event) => {
        if (!event.mediaType) return;

        try {
          const seasonNumber = event.metadata?.seasonNumber;
          const episodeNumber = event.metadata?.episodeNumber;
          const baseTitle = event.metadata?.baseTitle || event.title.replace(/\s*-\s*S\d{2}E\d{2}.*/i, "");
          const tvdbEpisodeId = (event as any).metadata?.tvdbEpisodeId;
          const seriesType = (event as any).metadata?.seriesType;
          let tmdbEpisodeId: number | null = null;

          if (event.tmdbId && typeof seasonNumber === "number" && typeof episodeNumber === "number") {
            try {
              const seasonEpisodes = await deduplicateFetch(
                `tmdb-season-episodes:${event.tmdbId}:${seasonNumber}`,
                () => getTvSeasonEpisodes(event.tmdbId!, seasonNumber),
                { ttl: CACHE_TTL_TMDB }
              );
              const matchedEpisode = Array.isArray(seasonEpisodes)
                ? seasonEpisodes.find((ep: any) => ep?.episode_number === episodeNumber)
                : null;
              if (matchedEpisode?.id) {
                tmdbEpisodeId = matchedEpisode.id;
                if (!event.metadata) event.metadata = {};
                event.metadata.tmdbEpisodeId = matchedEpisode.id;
              }
            } catch (tmdbError) {
              console.error("[Calendar] Error fetching TMDB episode id", {
                tmdbId: event.tmdbId,
                seasonNumber,
                episodeNumber,
                error: tmdbError
              });
            }
          }

          if (event.mediaType === "tv" && typeof episodeNumber === "number") {
            if (event.tmdbId && typeof seasonNumber === "number") {
              try {
                const cached = await getCachedAvailability(event.tmdbId, seasonNumber, event.tvdbId);
                const cachedByEpisode = cached.byEpisode.get(episodeNumber);
                const cachedByDate = event.date
                  ? cached.byAirDate.get(String(event.date).slice(0, 10))
                  : undefined;
                const cachedHit = cachedByEpisode ?? cachedByDate;
                if (cachedHit?.available) {
                  if (!event.metadata) event.metadata = {};
                  event.metadata.isAvailable = true;
                  if (cachedHit.jellyfinItemId) {
                    event.metadata.jellyfinItemId = cachedHit.jellyfinItemId;
                  }
                  return;
                }
              } catch (err) {
                logger.debug("[Calendar] Cached availability lookup failed", {
                  tmdbId: event.tmdbId,
                  seasonNumber,
                  error: String(err)
                });
              }
            }

            // Include airDate in cache key for daily series to avoid cache collisions
            const isDaily = String(seriesType ?? "").toLowerCase() === "daily";
            const lookupKey = isDaily
              ? `jellyfin-episode:${event.tmdbId ?? event.tvdbId ?? event.id}:${event.date}`
              : `jellyfin-episode:${event.tmdbId ?? event.tvdbId ?? event.id}:${seasonNumber}:${episodeNumber}`;
            
            logger.debug("[Calendar] Checking episode availability", {
              title: baseTitle,
              tmdbId: event.tmdbId,
              tvdbId: event.tvdbId,
              seasonNumber,
              episodeNumber,
              tvdbEpisodeId,
              seriesType,
              isDaily,
              airDate: event.date
            });
            
            const availability = await deduplicateFetch(
              lookupKey,
              () =>
                isEpisodeAvailable({
                  tmdbId: event.tmdbId,
                  tvdbId: event.tvdbId,
                  seasonNumber,
                  episodeNumber,
                  seriesTitle: baseTitle,
                  airDate: event.date,
                  tvdbEpisodeId,
                  seriesType,
                  tmdbEpisodeId
                }),
              { ttl: CACHE_TTL_JELLYFIN }
            );

            logger.debug("[Calendar] Episode availability result", {
              title: baseTitle,
              available: availability?.available,
              itemId: availability?.itemId
            });

            if (availability?.available) {
              if (!event.metadata) event.metadata = {};
              event.metadata.isAvailable = true;
              if (availability.itemId) {
                event.metadata.jellyfinItemId = availability.itemId;
              }
              return;
            } else {
              if (!event.metadata) event.metadata = {};
              event.metadata.isAvailable = false;
              return;
            }
          }

          if (!event.metadata) event.metadata = {};
          if (event.mediaType === "movie") {
            if (event.tmdbId) {
              const movieAvail = await deduplicateFetch(
                `jellyfin-movie-tmdb:${event.tmdbId}`,
                () => findAvailableMovieByTmdb(event.title, event.tmdbId!),
                { ttl: CACHE_TTL_JELLYFIN }
              );
              if (movieAvail?.available) {
                event.metadata.isAvailable = true;
                if (movieAvail.itemId) event.metadata.jellyfinItemId = movieAvail.itemId;
              } else {
                event.metadata.isAvailable = false;
              }
            } else {
              const movieAvail = await deduplicateFetch(
                `jellyfin-movie-name:${event.title}`,
                () => findAvailableMovieByName(event.title),
                { ttl: CACHE_TTL_JELLYFIN }
              );
              if (movieAvail?.available) {
                event.metadata.isAvailable = true;
                if (movieAvail.itemId) event.metadata.jellyfinItemId = movieAvail.itemId;
              } else {
                event.metadata.isAvailable = false;
              }
            }
            return;
          }

          if (event.mediaType === "tv") {
            const seriesAvail = await deduplicateFetch(
              `jellyfin-series:${event.tmdbId ?? event.tvdbId ?? event.title}`,
              () => findAvailableSeriesByIds(event.title, event.tmdbId, event.tvdbId),
              { ttl: CACHE_TTL_JELLYFIN }
            );
            if (seriesAvail?.available) {
              event.metadata.isAvailable = true;
              if (seriesAvail.itemId) event.metadata.jellyfinItemId = seriesAvail.itemId;
            } else {
              event.metadata.isAvailable = false;
            }
            return;
          }
        } catch (error) {
          // Non-fatal: Jellyfin down or item not found
          console.error(`[Calendar] Error checking Jellyfin availability for ${event.title}:`, error);
        }
      })
    );
  }

  return events;
}

/**
 * Main GET handler for calendar events
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token");
    const user = token ? await getCalendarFeedUserByToken(token) : await getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Date range parameters
    const now = new Date();
    const start = searchParams.get("start") || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = searchParams.get("end") || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    // Optional query parameters
    const includeJellyfinAvailability = searchParams.get("jellyfin") !== "false"; // Default true
    const includeSonarr = searchParams.get("sonarr") !== "false"; // Default true
    const includeRadarr = searchParams.get("radarr") !== "false"; // Default true
    const includeSeasonPremieres = searchParams.get("seasons") !== "false"; // Default true

    // Fetch all event sources in parallel (with graceful degradation)
    const [
      tmdbEvents,
      sonarrEvents,
      radarrEvents,
      seasonPremieres,
      requestEvents
    ] = await Promise.allSettled([
      getTmdbReleasesInRange(start, end),
      includeSonarr ? getSonarrCalendarEvents(start, end) : Promise.resolve([]),
      includeRadarr ? getRadarrCalendarEvents(start, end) : Promise.resolve([]),
      includeSeasonPremieres ? getSeasonPremieres(user.id, start, end) : Promise.resolve([]),
      getRequestsWithReleaseDate(user.id)
    ]);

    // Collect all successful events
    let allEvents: CalendarEvent[] = [];

    if (tmdbEvents.status === 'fulfilled') allEvents.push(...tmdbEvents.value);
    if (sonarrEvents.status === 'fulfilled') allEvents.push(...sonarrEvents.value);
    if (radarrEvents.status === 'fulfilled') allEvents.push(...radarrEvents.value);
    if (seasonPremieres.status === 'fulfilled') allEvents.push(...seasonPremieres.value);
    if (requestEvents.status === 'fulfilled') allEvents.push(...requestEvents.value);

    // Merge Radarr movies into TMDB releases when they refer to the same title/id/date
    const tmdbMovieMap = new Map<number, CalendarEvent>();
    const titleDateMap = new Map<string, CalendarEvent>();

    const normalizeTitle = (title?: string | null) =>
      (title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    allEvents.forEach((event) => {
      if (event.type === "movie_release") {
        if (event.tmdbId) tmdbMovieMap.set(event.tmdbId, event);
        const key = `${normalizeTitle(event.title)}:${event.date}`;
        titleDateMap.set(key, event);
      }
    });

    allEvents = allEvents.filter((event) => {
      if (event.type !== "radarr_monitored") return true;

      // Prefer TMDB id match
      if (event.tmdbId) {
        const tmdbEvent = tmdbMovieMap.get(event.tmdbId);
        if (tmdbEvent) {
          tmdbEvent.metadata = { ...event.metadata, ...tmdbEvent.metadata };
          tmdbEvent.posterPath = tmdbEvent.posterPath ?? event.posterPath;
          tmdbEvent.backdropPath = tmdbEvent.backdropPath ?? event.backdropPath;
          tmdbEvent.mediaType = "movie";
          return false; // drop Radarr duplicate
        }
      }

      // Fallback to title/date match
      const titleKey = `${normalizeTitle(event.title)}:${event.date}`;
      const titleMatch = titleDateMap.get(titleKey);
      if (titleMatch) {
        titleMatch.metadata = { ...event.metadata, ...titleMatch.metadata };
        titleMatch.posterPath = titleMatch.posterPath ?? event.posterPath;
        titleMatch.backdropPath = titleMatch.backdropPath ?? event.backdropPath;
        titleMatch.mediaType = "movie";
        return false; // drop Radarr duplicate
      }

      return true;
    });

    // Enrich with Jellyfin availability if requested
    if (includeJellyfinAvailability) {
      allEvents = await enrichWithJellyfinAvailability(allEvents);
    }

    return NextResponse.json({ events: allEvents });
  } catch (error) {
    console.error("[Calendar] Error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar events" }, { status: 500 });
  }
}
