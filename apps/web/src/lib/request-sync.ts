import {
  RequestForSync,
  mergeDuplicateEpisodeRequests,
  listRequestsForSync,
  markRequestStatus,
  setRequestItemsStatus,
  setEpisodeRequestItemsStatuses,
  addUserMediaListItem,
  addRequestItem,
  getRequestForSync
} from "@/db";
import { RequestNotificationEvent, notifyRequestEvent } from "@/notifications/request-events";
import { notifyRequestAvailable } from "./notification-helper";
import { getRadarrMovie, radarrQueue } from "./radarr";
import { getSeries, sonarrQueue } from "./sonarr";
import { isServiceNotFoundError } from "./fetch-utils";
import { seriesHasFiles, STATUS_STRINGS } from "./media-status";
import { getAvailabilityStatusByTmdbIds } from "./library-availability";

type SyncSummary = {
  processed: number;
  available: number;
  partiallyAvailable: number;
  downloading: number;
  removed: number;
  errors: number;
};

type QueueEntry = Record<string, any>;

function normalizeQueueRecords(response: any): QueueEntry[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.records)) return response.records;
  return [];
}

function hasQueueEntry(entry: QueueEntry | undefined): boolean {
  if (!entry) return false;
  const status = String(entry.status ?? "").toLowerCase();
  if (!status || status === "completed") return false;
  return true;
}

const statusNotificationMap: Record<string, RequestNotificationEvent | undefined> = {
  partially_available: "request_partially_available",
  downloading: "request_downloading",
  available: "request_available",
  removed: "request_removed"
};

async function maybeSendStatusNotification(request: RequestForSync, status: string) {
  const event = statusNotificationMap[status];
  if (!event) return;

  if (status === "available" && request.request_type === "episode") {
    const live = await getAvailabilityStatusByTmdbIds("tv", [request.tmdb_id]).catch(() => ({} as Record<number, string>));
    if (live[request.tmdb_id] !== "available") {
      return;
    }
  }

  await notifyRequestEvent(event, {
    requestId: request.id,
    requestType: request.request_type,
    tmdbId: request.tmdb_id,
    title: request.title,
    username: request.username || "Unknown",
    userId: request.requested_by
  });
  
  // Also send in-app notification
  if (status === "available") {
    await notifyRequestAvailable(
      request.requested_by,
      request.title,
      request.id,
      request.request_type === "movie" ? "movie" : "tv",
      request.tmdb_id
    );
  }
}

async function updateRequestStatuses(request: RequestForSync, requestStatus: string, options?: { syncItemStatuses?: boolean }) {
  if (request.status === requestStatus) {
    return;
  }

  const syncItemStatuses = options?.syncItemStatuses ?? true;
  const tasks: Array<Promise<unknown>> = [markRequestStatus(request.id, requestStatus)];
  if (syncItemStatuses) {
    tasks.push(setRequestItemsStatus(request.id, requestStatus));
  }
  await Promise.all(tasks);
  request.status = requestStatus;
  await maybeSendStatusNotification(request, requestStatus);
}

async function syncMovieRequest(request: RequestForSync, queueMap: Map<number, QueueEntry>) {
  const item = request.items.find(i => i.provider === "radarr");
  if (!item || !item.provider_id) return null;
  try {
    const movie = await getRadarrMovie(item.provider_id);
    if (movie?.hasFile) {
      await updateRequestStatuses(request, "available");
      return "available";
    }
    const queueEntry = queueMap.get(item.provider_id);
    if (queueEntry && hasQueueEntry(queueEntry)) {
      await updateRequestStatuses(request, "downloading");
      return "downloading";
    }
    return null;
  } catch (err) {
    if (isServiceNotFoundError(err)) {
      await updateRequestStatuses(request, "removed");
      return "removed";
    }
    throw err;
  }
}

async function syncEpisodeRequest(request: RequestForSync, queueMap: Map<number, QueueEntry>) {
  const item = request.items.find(i => i.provider === "sonarr");
  if (!item || !item.provider_id) return null;
  let series;
  try {
    series = await getSeries(item.provider_id);
  } catch (err) {
    if (isServiceNotFoundError(err)) {
      await updateRequestStatuses(request, "removed");
      return "removed";
    }
    throw err;
  }
  if (!series?.id) {
    await updateRequestStatuses(request, "removed");
    return "removed";
  }

  const episodes = await getEpisodesForSeries(series.id);
  // New-season auto-requests are handled by the dedicated job.
  const byKey = new Map<string, any>();
  for (const ep of episodes || []) {
    const seasonNumber = Number(ep?.seasonNumber);
    const episodeNumber = Number(ep?.episodeNumber);
    if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) continue;
    byKey.set(`${seasonNumber}:${episodeNumber}`, ep);
  }

  const trackedItems = request.items.filter(
    reqItem => reqItem.provider === "sonarr" && reqItem.season != null && reqItem.episode != null
  );
  const totalRequestedCount = trackedItems.length;
  let availableCount = 0;
  let hasQueue = false;
  const itemStatuses: Array<{ season: number; episode: number; status: string }> = [];

  for (const reqItem of trackedItems) {
    const season = Number(reqItem.season);
    const episode = Number(reqItem.episode);
    const match = byKey.get(`${season}:${episode}`);
    if (match?.hasFile) {
      availableCount += 1;
      itemStatuses.push({ season, episode, status: "available" });
      continue;
    }
    if (match && queueMap.has(Number(match.id))) {
      hasQueue = true;
      itemStatuses.push({ season, episode, status: "downloading" });
      continue;
    }
    itemStatuses.push({ season, episode, status: request.status === "pending" ? "pending" : "submitted" });
  }

  await setEpisodeRequestItemsStatuses(request.id, itemStatuses);

  if (totalRequestedCount > 0 && availableCount === totalRequestedCount) {
    await updateRequestStatuses(request, STATUS_STRINGS.AVAILABLE, { syncItemStatuses: false });
    return STATUS_STRINGS.AVAILABLE;
  }

  if (totalRequestedCount > 0 && availableCount > 0) {
    await updateRequestStatuses(request, STATUS_STRINGS.PARTIALLY_AVAILABLE, { syncItemStatuses: false });
    return STATUS_STRINGS.PARTIALLY_AVAILABLE;
  }

  if (hasQueue) {
    await updateRequestStatuses(request, "downloading", { syncItemStatuses: false });
    return "downloading";
  }

  return null;
}

async function autoRequestMissingEpisodesForSeries(request: RequestForSync) {
  const item = request.items.find(i => i.provider === "sonarr");
  if (!item || !item.provider_id) return { added: 0 };

  const series = await getSeries(item.provider_id).catch(() => null);
  if (!series?.id || !series?.monitored) return { added: 0 };

  const episodes = await getEpisodesForSeries(series.id).catch(() => []);
  if (!Array.isArray(episodes) || episodes.length === 0) return { added: 0 };

  const requestedKeys = new Set(
    request.items
      .filter(item => item.provider === "sonarr" && item.season != null && item.episode != null)
      .map(item => `${item.season}:${item.episode}`)
  );

  const missingEpisodes = episodes.filter((ep: any) => {
    const seasonNumber = Number(ep?.seasonNumber);
    const episodeNumber = Number(ep?.episodeNumber);
    if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) return false;
    if (seasonNumber <= 0) return false;
    return !requestedKeys.has(`${seasonNumber}:${episodeNumber}`);
  });

  if (!missingEpisodes.length) return { added: 0 };

  await Promise.all(
    missingEpisodes.map((ep: any) =>
      addRequestItem({
        requestId: request.id,
        provider: "sonarr",
        providerId: series.id ?? null,
        season: Number(ep.seasonNumber),
        episode: Number(ep.episodeNumber),
        status: "submitted"
      })
    )
  );

  const missingEpisodeIds = missingEpisodes
    .map((ep: any) => Number(ep?.id))
    .filter((id: number) => Number.isFinite(id) && id > 0);
  if (missingEpisodeIds.length > 0) {
    await setEpisodeMonitored(missingEpisodeIds, true).catch(() => null);
    await episodeSearch(missingEpisodeIds).catch(() => null);
  }

  if (request.status !== "pending" && request.status !== "queued") {
    await updateRequestStatuses(request, "submitted", { syncItemStatuses: false });
  }

  await notifyRequestEvent("request_submitted", {
    requestId: request.id,
    requestType: request.request_type,
    tmdbId: request.tmdb_id,
    title: request.title,
    username: request.username || "Unknown",
    userId: request.requested_by,
    sonarrSeriesId: series.id ?? null,
    tvdbId: series?.tvdbId ?? null
  });

  return { added: missingEpisodes.length };
}

export async function syncNewSeasonsAutoRequests(): Promise<{ processed: number; added: number; errors: number }> {
  const requests = await listRequestsForSync(200);
  if (!requests.length) return { processed: 0, added: 0, errors: 0 };

  let processed = 0;
  let added = 0;
  let errors = 0;

  for (const request of requests) {
    if (request.request_type !== "episode") continue;
    processed += 1;
    try {
      const result = await autoRequestMissingEpisodesForSeries(request);
      added += result.added;
    } catch {
      errors += 1;
    }
  }

  return { processed, added, errors };
}

import { listUsersWithWatchlistSync, createRequestWithItemsTransaction, findActiveRequestByTmdb, getUserTraktToken, upsertUserTraktToken, getTraktConfig } from "@/db";
import { getJellyfinWatchlist } from "@/lib/jellyfin";
import { getMovie as getTmdbMovie, getTv as getTmdbTv, getTvExternalIds } from "@/lib/tmdb";
import { getMovieByTmdbId } from "@/lib/radarr";
import { evaluateApprovalRules } from "@/lib/approval-rules";
import {
  addSeriesFromLookup,
  episodeSearch,
  getEpisodesForSeries,
  getSeriesByTmdbId,
  getSeriesByTvdbId,
  listSeries,
  lookupSeriesByTvdb,
  seriesSearch,
  setEpisodeMonitored
} from "@/lib/sonarr";
import { logger } from "@/lib/logger";
import { fetchTraktWatchlist, refreshTraktToken } from "@/lib/trakt";
import { addMovie } from "@/lib/radarr";

export type AutoRequestItem = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  titleHint?: string;
  tvdbId?: number | null;
};

type UserPermissions = {
  permManageRequests?: boolean;
  permAutoapprove?: boolean;
  permAutoapproveMovies?: boolean;
  permAutoapproveTv?: boolean;
};

export type AutoRequestUser = {
  id: number;
  username: string;
  syncMovies: boolean;
  syncTv: boolean;
  isAdmin: boolean;
  permissions?: UserPermissions;
};

function canAutoApproveFromPermissions(permissions: UserPermissions | undefined, mediaType: "movie" | "tv") {
  if (!permissions) return false;
  if (permissions.permManageRequests) return true;
  if (permissions.permAutoapprove) return true;
  if (mediaType === "movie" && permissions.permAutoapproveMovies) return true;
  if (mediaType === "tv" && permissions.permAutoapproveTv) return true;
  return false;
}

export async function autoRequestItemsForUser(
  user: AutoRequestUser,
  items: AutoRequestItem[]
): Promise<{ createdCount: number; errors: number; skippedExisting: number }> {
  let createdCount = 0;
  let errors = 0;
  let skippedExisting = 0;

  for (const entry of items) {
    try {
      const isMovie = entry.mediaType === "movie";
      const isSeries = entry.mediaType === "tv";
      if (isMovie && !user.syncMovies) continue;
      if (isSeries && !user.syncTv) continue;

      const tmdbId = entry.tmdbId;

      // Keep local watchlist in sync so it appears in /watchlist
      await addUserMediaListItem({
        userId: user.id,
        listType: "watchlist",
        mediaType: isMovie ? "movie" : "tv",
        tmdbId
      });

      const existing = await findActiveRequestByTmdb({
        requestType: isMovie ? "movie" : "episode",
        tmdbId
      });
      if (existing) {
        skippedExisting++;
        continue;
      }

      let existsInService = false;
      if (isMovie) {
        const m = await getMovieByTmdbId(tmdbId);
        if (m) existsInService = true;
      } else {
        const s = await getSeriesByTmdbId(tmdbId);
        if (s) {
          existsInService = true;
        } else if (entry.tvdbId) {
          const tvdbId = entry.tvdbId;
          if (!isNaN(tvdbId)) {
            const s2 = await getSeriesByTvdbId(tvdbId);
            if (s2) existsInService = true;
          }
        }
      }

      if (existsInService) continue;

      let title = entry.titleHint || (isMovie ? "Unknown Movie" : "Unknown Series");
      let posterPath = null;
      let backdropPath = null;
      let releaseYear = null;
      let voteAverage: number | undefined;
      let popularity: number | undefined;
      let genres: number[] | undefined;

      try {
        if (isMovie) {
          const tmdbData = await getTmdbMovie(tmdbId);
          if (tmdbData) {
            title = tmdbData.title;
            posterPath = tmdbData.poster_path;
            backdropPath = tmdbData.backdrop_path;
            releaseYear = tmdbData.release_date ? new Date(tmdbData.release_date).getFullYear() : null;
            voteAverage = typeof tmdbData.vote_average === "number" ? tmdbData.vote_average : undefined;
            popularity = typeof tmdbData.popularity === "number" ? tmdbData.popularity : undefined;
            genres = Array.isArray(tmdbData.genres) ? tmdbData.genres.map((g: any) => Number(g.id)).filter((n: number) => Number.isFinite(n)) : undefined;
          }
        } else {
          const tmdbData = await getTmdbTv(tmdbId);
          if (tmdbData) {
            title = tmdbData.name;
            posterPath = tmdbData.poster_path;
            backdropPath = tmdbData.backdrop_path;
            releaseYear = tmdbData.first_air_date ? new Date(tmdbData.first_air_date).getFullYear() : null;
            voteAverage = typeof tmdbData.vote_average === "number" ? tmdbData.vote_average : undefined;
            popularity = typeof tmdbData.popularity === "number" ? tmdbData.popularity : undefined;
            genres = Array.isArray(tmdbData.genres) ? tmdbData.genres.map((g: any) => Number(g.id)).filter((n: number) => Number.isFinite(n)) : undefined;
          }
        }
      } catch {
        // ignore metadata fetch errors
      }

      let autoApprove = user.isAdmin || canAutoApproveFromPermissions(user.permissions, entry.mediaType);
      if (!autoApprove && !user.isAdmin) {
        const { shouldApprove } = await evaluateApprovalRules({
          requestType: isMovie ? "movie" : "episode",
          tmdbId,
          userId: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          voteAverage,
          popularity,
          genres,
          releaseYear: releaseYear ?? undefined
        });
        autoApprove = shouldApprove;
      }

      const requestStatus = autoApprove ? "queued" : "pending";
      const finalStatus = autoApprove ? "submitted" : undefined;

      if (isMovie) {
        let providerId: number | null = null;
        if (autoApprove) {
          try {
            const radarrMovie = await addMovie(tmdbId, undefined, null);
            providerId = radarrMovie?.id ?? null;
          } catch (e) {
            logger.error("[request-sync] Failed to add movie to Radarr", e);
          }
        }

        await createRequestWithItemsTransaction({
          requestType: "movie",
          tmdbId,
          title,
          userId: user.id,
          requestStatus,
          finalStatus,
          posterPath,
          backdropPath,
          releaseYear,
          items: [
            {
              provider: "radarr",
              providerId,
              status: finalStatus ?? requestStatus
            }
          ]
        });
      } else {
        let tvdbId = entry.tvdbId ?? null;
        if (!tvdbId) {
          try {
            const ext = await getTvExternalIds(tmdbId);
            tvdbId = ext?.tvdb_id ?? null;
          } catch {
            tvdbId = null;
          }
        }
        if (!tvdbId) {
          throw new Error("TMDB show has no tvdb_id; Sonarr needs TVDB");
        }

        let series = (await listSeries()).find((s: any) => Number(s.tvdbId) === Number(tvdbId));
        let seriesAdded = false;
        if (!series) {
          const lookup = await lookupSeriesByTvdb(tvdbId);
          if (!Array.isArray(lookup) || lookup.length === 0) {
            throw new Error(`Sonarr lookup returned nothing for tvdb:${tvdbId}`);
          }
          series = await addSeriesFromLookup(lookup[0], autoApprove, undefined);
          seriesAdded = true;
          if (autoApprove) {
            await seriesSearch(series.id);
          }
        }

        const attempts = seriesAdded ? 4 : 1;
        let episodes = await getEpisodesForSeries(series.id);
        if ((!episodes || episodes.length === 0) && attempts > 1) {
          for (let i = 0; i < attempts; i++) {
            episodes = await getEpisodesForSeries(series.id);
            if (episodes?.length) break;
          }
        }

        if (autoApprove && Array.isArray(episodes) && episodes.length > 0) {
          const episodeIds = episodes.map((ep: any) => ep.id);
          await setEpisodeMonitored(episodeIds, true);
          await episodeSearch(episodeIds);
        }

        const items = Array.isArray(episodes)
          ? episodes.map((ep: any) => ({
              provider: "sonarr" as const,
              providerId: series.id ?? null,
              season: ep.seasonNumber,
              episode: ep.episodeNumber,
              status: finalStatus ?? requestStatus
            }))
          : [
              {
                provider: "sonarr" as const,
                providerId: series.id ?? null,
                status: finalStatus ?? requestStatus
              }
            ];

        await createRequestWithItemsTransaction({
          requestType: "episode",
          tmdbId,
          title,
          userId: user.id,
          requestStatus,
          finalStatus,
          posterPath,
          backdropPath,
          releaseYear,
          items
        });
      }
      createdCount++;
    } catch (err) {
      logger.error(`[request-sync] Failed to auto-request item for user ${user.username}`, err);
      errors++;
    }
  }

  return { createdCount, errors, skippedExisting };
}

export async function syncWatchlists(options?: { userId?: number }) {
  const users = await listUsersWithWatchlistSync(options?.userId);
  let createdCount = 0;
  let errors = 0;
  const traktConfig = await getTraktConfig();
  const traktEnabled = !!(traktConfig.enabled && traktConfig.clientId && traktConfig.clientSecret);

  for (const user of users) {
    try {
      const watchlistItems = new Map<string, { tmdbId: number; mediaType: "movie" | "tv"; titleHint?: string; tvdbId?: number | null }>();

      if (user.jellyfinUserId) {
        const watchlist = await getJellyfinWatchlist(user.jellyfinUserId);
        for (const item of watchlist) {
          const isMovie = item.Type === "Movie";
          const isSeries = item.Type === "Series";
          if (!isMovie && !isSeries) continue;
          if (isMovie && !user.syncMovies) continue;
          if (isSeries && !user.syncTv) continue;

          const tmdbIdStr = item.ProviderIds.Tmdb;
          const tmdbId = tmdbIdStr ? parseInt(tmdbIdStr, 10) : null;
          if (!tmdbId || isNaN(tmdbId)) continue;

          const mediaType = isMovie ? "movie" : "tv";
          const tvdbId = item.ProviderIds?.Tvdb ? parseInt(item.ProviderIds.Tvdb, 10) : null;
          watchlistItems.set(`${mediaType}:${tmdbId}`, { tmdbId, mediaType, titleHint: item.Name, tvdbId: Number.isNaN(tvdbId) ? null : tvdbId });
        }
      }

      if (user.hasTrakt && traktEnabled) {
        const token = await getUserTraktToken(user.id);
        if (token?.accessToken) {
          let accessToken = token.accessToken;
          let refreshToken = token.refreshToken;
          let expiresAt = token.expiresAt;
          const now = Date.now();
          const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : null;
          const isExpired = expiresAtMs ? expiresAtMs - now < 60 * 1000 : false;
          if (isExpired && refreshToken) {
            const refreshed = await refreshTraktToken({
              refreshToken,
              clientId: traktConfig.clientId,
              clientSecret: traktConfig.clientSecret
            });
            accessToken = refreshed.access_token;
            refreshToken = refreshed.refresh_token;
            expiresAt = new Date((refreshed.created_at + refreshed.expires_in) * 1000).toISOString();
            await upsertUserTraktToken({
              userId: user.id,
              accessToken,
              refreshToken,
              expiresAt,
              scope: refreshed.scope ?? null
            });
          }

          if (user.syncMovies) {
            const movies = await fetchTraktWatchlist({ accessToken, clientId: traktConfig.clientId, type: "movies" });
            for (const item of movies) {
              watchlistItems.set(`movie:${item.tmdbId}`, { tmdbId: item.tmdbId, mediaType: "movie" });
            }
          }

          if (user.syncTv) {
            const shows = await fetchTraktWatchlist({ accessToken, clientId: traktConfig.clientId, type: "shows" });
            for (const item of shows) {
              watchlistItems.set(`tv:${item.tmdbId}`, { tmdbId: item.tmdbId, mediaType: "tv" });
            }
          }
        }
      }

      const { createdCount: userCreated, errors: userErrors } = await autoRequestItemsForUser(user, Array.from(watchlistItems.values()));
      createdCount += userCreated;
      errors += userErrors;
    } catch (err) {
      logger.error(`[request-sync] Failed to sync watchlist for user ${user.username}`, err);
      errors++;
    }
  }
  
  return { createdCount, errors };
}

export async function syncPendingRequests(): Promise<SyncSummary> {
  await mergeDuplicateEpisodeRequests().catch(() => null);
  const requests = await listRequestsForSync(100);
  if (!requests.length) {
    return { processed: 0, available: 0, partiallyAvailable: 0, downloading: 0, removed: 0, errors: 0 };
  }

  const [radarrQueueRes, sonarrQueueRes] = await Promise.all([
    radarrQueue(1, 200).catch(() => null),
    sonarrQueue(1, 200).catch(() => null)
  ]);

  const radarrQueueRecords = normalizeQueueRecords(radarrQueueRes);
  const sonarrQueueRecords = normalizeQueueRecords(sonarrQueueRes);

  const radarrQueueMap = new Map<number, QueueEntry>();
  for (const entry of radarrQueueRecords) {
    if (typeof entry.movieId === "number") {
      radarrQueueMap.set(entry.movieId, entry);
    }
  }

  const sonarrQueueMap = new Map<number, QueueEntry>();
  for (const entry of sonarrQueueRecords) {
    if (Array.isArray(entry.episodeIds)) {
      for (const epId of entry.episodeIds) {
        if (typeof epId === "number") {
          sonarrQueueMap.set(epId, entry);
        }
      }
    } else if (typeof entry.episodeId === "number") {
      sonarrQueueMap.set(entry.episodeId, entry);
    }
  }

  const summary: SyncSummary = { processed: 0, available: 0, partiallyAvailable: 0, downloading: 0, removed: 0, errors: 0 };
  for (const request of requests) {
    try {
      summary.processed += 1;
      const result =
        request.request_type === "movie"
          ? await syncMovieRequest(request, radarrQueueMap)
          : await syncEpisodeRequest(request, sonarrQueueMap);
      if (result === "available") summary.available += 1;
      if (result === "partially_available") summary.partiallyAvailable += 1;
      if (result === "downloading") summary.downloading += 1;
      if (result === "removed") summary.removed += 1;
    } catch (err) {
      summary.errors += 1;
    }
  }

  return summary;
}

export async function syncRequestById(requestId: string): Promise<SyncSummary> {
  const request = await getRequestForSync(requestId);
  if (!request) {
    return { processed: 0, available: 0, partiallyAvailable: 0, downloading: 0, removed: 0, errors: 0 };
  }

  const [radarrQueueRes, sonarrQueueRes] = await Promise.all([
    radarrQueue(1, 200).catch(() => null),
    sonarrQueue(1, 200).catch(() => null)
  ]);

  const radarrQueueRecords = normalizeQueueRecords(radarrQueueRes);
  const sonarrQueueRecords = normalizeQueueRecords(sonarrQueueRes);

  const radarrQueueMap = new Map<number, QueueEntry>();
  for (const entry of radarrQueueRecords) {
    if (typeof entry.movieId === "number") {
      radarrQueueMap.set(entry.movieId, entry);
    }
  }

  const sonarrQueueMap = new Map<number, QueueEntry>();
  for (const entry of sonarrQueueRecords) {
    if (Array.isArray(entry.episodeIds)) {
      for (const epId of entry.episodeIds) {
        if (typeof epId === "number") {
          sonarrQueueMap.set(epId, entry);
        }
      }
    } else if (typeof entry.episodeId === "number") {
      sonarrQueueMap.set(entry.episodeId, entry);
    }
  }

  const summary: SyncSummary = { processed: 1, available: 0, partiallyAvailable: 0, downloading: 0, removed: 0, errors: 0 };
  try {
    const result =
      request.request_type === "movie"
        ? await syncMovieRequest(request, radarrQueueMap)
        : await syncEpisodeRequest(request, sonarrQueueMap);
    if (result === "available") summary.available += 1;
    if (result === "partially_available") summary.partiallyAvailable += 1;
    if (result === "downloading") summary.downloading += 1;
    if (result === "removed") summary.removed += 1;
  } catch {
    summary.errors += 1;
  }

  return summary;
}
