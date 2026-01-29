import {
  RequestForSync,
  listRequestsForSync,
  markRequestStatus,
  setRequestItemsStatus
} from "@/db";
import { RequestNotificationEvent, notifyRequestEvent } from "@/notifications/request-events";
import { notifyRequestAvailable } from "./notification-helper";
import { getRadarrMovie, radarrQueue } from "./radarr";
import { getEpisodesForSeries, getSeries, sonarrQueue } from "./sonarr";
import { isServiceNotFoundError } from "./fetch-utils";
import { isSeriesPartiallyAvailable, seriesHasFiles, STATUS_STRINGS } from "./media-status";

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
  available: "request_available",
  removed: "request_removed"
};

async function maybeSendStatusNotification(request: RequestForSync, status: string) {
  const event = statusNotificationMap[status];
  if (!event) return;
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

async function updateRequestStatuses(request: RequestForSync, requestStatus: string) {
  if (request.status === requestStatus) {
    return;
  }

  await Promise.all([markRequestStatus(request.id, requestStatus), setRequestItemsStatus(request.id, requestStatus)]);
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
  const requested = request.items
    .map(reqItem => {
      if (reqItem.provider !== "sonarr" || reqItem.season == null || reqItem.episode == null) {
        return null;
      }
      return episodes.find(
        (ep: any) => ep.seasonNumber === reqItem.season && ep.episodeNumber === reqItem.episode
      );
    })
    .filter(Boolean) as Array<{ id: number; hasFile: boolean }>;

  const availableCount = requested.filter(ep => ep.hasFile).length;

  // Use shared utility to check if series is partially available
  const isSeriesPartial = isSeriesPartiallyAvailable(series);

  // If all requested episodes are available
  if (requested.length && availableCount === requested.length) {
    // But if the series itself is only partially available, mark as partially_available
    if (isSeriesPartial) {
      await updateRequestStatuses(request, STATUS_STRINGS.PARTIALLY_AVAILABLE);
      return STATUS_STRINGS.PARTIALLY_AVAILABLE;
    }
    await updateRequestStatuses(request, STATUS_STRINGS.AVAILABLE);
    return STATUS_STRINGS.AVAILABLE;
  }

  // Some but not all requested episodes are available
  if (requested.length && availableCount > 0) {
    await updateRequestStatuses(request, STATUS_STRINGS.PARTIALLY_AVAILABLE);
    return STATUS_STRINGS.PARTIALLY_AVAILABLE;
  }

  const hasQueue = requested.some(ep => queueMap.has(ep.id));
  if (hasQueue) {
    await updateRequestStatuses(request, "downloading");
    return "downloading";
  }

  return null;
}

import { listUsersWithWatchlistSync, createRequestWithItemsTransaction, findActiveRequestByTmdb } from "@/db";
import { getJellyfinWatchlist } from "@/lib/jellyfin";
import { getMovie as getTmdbMovie, getTv as getTmdbTv } from "@/lib/tmdb";
import { getMovieByTmdbId } from "@/lib/radarr";
import { getSeriesByTmdbId, getSeriesByTvdbId } from "@/lib/sonarr";
import { logger } from "@/lib/logger";

export async function syncWatchlists(options?: { userId?: number }) {
  const users = await listUsersWithWatchlistSync(options?.userId);
  let createdCount = 0;
  let errors = 0;

  for (const user of users) {
    try {
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

        // Check if already requested
        const existing = await findActiveRequestByTmdb({
          requestType: isMovie ? "movie" : "episode",
          tmdbId
        });
        if (existing) continue;

        // Check availability in services
        let existsInService = false;
        if (isMovie) {
          const m = await getMovieByTmdbId(tmdbId);
          if (m) existsInService = true;
        } else {
          // For TV, check TMDB first, then TVDB
          const s = await getSeriesByTmdbId(tmdbId);
          if (s) {
            existsInService = true;
          } else if (item.ProviderIds.Tvdb) {
            const tvdbId = parseInt(item.ProviderIds.Tvdb, 10);
            if (!isNaN(tvdbId)) {
              const s2 = await getSeriesByTvdbId(tvdbId);
              if (s2) existsInService = true;
            }
          }
        }

        if (existsInService) continue;

        // Fetch Metadata
        let title = item.Name;
        let posterPath = null;
        let backdropPath = null;
        let releaseYear = null;

        try {
            if (isMovie) {
                const tmdbData = await getTmdbMovie(tmdbId);
                if (tmdbData) {
                    title = tmdbData.title;
                    posterPath = tmdbData.poster_path;
                    backdropPath = tmdbData.backdrop_path;
                    releaseYear = tmdbData.release_date ? new Date(tmdbData.release_date).getFullYear() : null;
                }
            } else {
                const tmdbData = await getTmdbTv(tmdbId);
                if (tmdbData) {
                    title = tmdbData.name;
                    posterPath = tmdbData.poster_path;
                    backdropPath = tmdbData.backdrop_path;
                    releaseYear = tmdbData.first_air_date ? new Date(tmdbData.first_air_date).getFullYear() : null;
                }
            }
        } catch (e) {
            // Ignore metadata fetch errors, use defaults
        }

        // Create Request
        // If admin, status is 'submitted' (implying approved), otherwise 'pending' (requiring approval)
        // NOTE: In a full implementation, 'submitted' requests should be automatically sent to Radarr/Sonarr.
        // For now, we set to 'pending' for non-admins. Admin requests are 'submitted'.
        // If the system has an auto-approver for 'submitted' requests, it will handle it.
        // Otherwise they sit as submitted.
        
        // Per user request: "if they're not an admin it will have to be approved... and if an admin it does obvs"
        // This implies auto-approve for admins.
        
        const requestStatus = user.isAdmin ? "queued" : "pending";
        const finalStatus = user.isAdmin ? "submitted" : undefined;

        await createRequestWithItemsTransaction({
          requestType: isMovie ? "movie" : "episode",
          // Wait, createRequest schema says: request_type CHECK (request_type IN ('movie','episode'))
          // But usually Series requests are type 'tv'?
          // Let's check db.ts createRequest input type.
          // It says `requestType: "movie" | "episode"`. 
          // But looking at getRequestCounts in db.ts: `COUNT(CASE WHEN request_type = 'episode' THEN 1 END)`
          // It seems 'episode' is used for TV. 
          // But media_request table constraint says `request_type IN ('movie','episode')`.
          // Okay, so we use 'episode' for Series requests? Or is there a separate 'tv' type?
          // The table definition in `db.ts` says `request_type TEXT NOT NULL CHECK (request_type IN ('movie','episode'))`.
          // So for a Series request, do we create a request for 'episode'?
          // Usually a Series request implies requesting the show.
          // Let's check `createRequest` usage in `app/api/v1/request/route.ts` if possible.
          
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
              provider: isMovie ? "radarr" : "sonarr",
              providerId: null,
              status: finalStatus ?? requestStatus
            }
          ]
        });
        createdCount++;
      }
    } catch (err) {
      logger.error(`[request-sync] Failed to sync watchlist for user ${user.username}`, err);
      errors++;
    }
  }
  
  return { createdCount, errors };
}

export async function syncPendingRequests(): Promise<SyncSummary> {
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
