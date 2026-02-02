import { getJellyfinConfig, upsertJellyfinAvailability, startJellyfinScan, updateJellyfinScan } from "@/db";
import { logger } from "@/lib/logger";
import { decryptSecret } from "@/lib/encryption";
import { getPool } from "@/db";
import { validateExternalServiceUrl } from "@/lib/url-validation";

async function getJellyfinConnection(): Promise<{ baseUrl: string; apiKey: string } | null> {
  const config = await getJellyfinConfig();
  if (!config.hostname || !config.apiKeyEncrypted) return null;
  const baseUrl = buildBaseUrl(config);
  if (!baseUrl) return null;

  // Validate URL to prevent SSRF attacks
  try {
  const allowHttp = process.env.JELLYFIN_ALLOW_HTTP === "true";
  const allowPrivateIPs = process.env.JELLYFIN_ALLOW_PRIVATE_IPS === "true";
  const allowedCidrs = process.env.JELLYFIN_ALLOWED_CIDRS?.split(",").map(part => part.trim()).filter(Boolean);
  validateExternalServiceUrl(baseUrl, "Jellyfin Availability Sync", {
    allowHttp,
    allowPrivateIPs,
    allowedCidrs,
    requireHttps: !allowHttp && process.env.NODE_ENV === "production"
  });
  } catch (err) {
    logger.error("[Jellyfin Availability Sync] URL validation failed", err);
    return null;
  }

  try {
    const apiKey = decryptSecret(config.apiKeyEncrypted);
    return { baseUrl, apiKey };
  } catch (err) {
    logger.error("[Jellyfin Availability Sync] Failed to decrypt API key", err);
    return null;
  }
}

function buildBaseUrl(config: { hostname: string; port: number; useSsl: boolean; urlBase: string }) {
  const host = config.hostname.trim();
  if (!host) return "";

  // Prevent URL injection by validating hostname doesn't contain protocol
  if (host.includes('://')) {
    logger.error("[Jellyfin Availability Sync] Invalid hostname - contains protocol", { hostname: host });
    return "";
  }

  const basePath = config.urlBase.trim();
  const normalizedPath = basePath
    ? basePath.startsWith("/")
      ? basePath
      : `/${basePath}`
    : "";
  const port = config.port ? `:${config.port}` : "";
  return `${config.useSsl ? "https" : "http"}://${host}${port}${normalizedPath}`;
}

async function jellyfinFetch(path: string) {
  const connection = await getJellyfinConnection();
  if (!connection) return null;
  const baseUrl = connection.baseUrl.replace(/\/+$/, "");
  const url = new URL(baseUrl + path);
  const headers = new Headers();
  headers.set("X-Emby-Token", connection.apiKey);
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch (err) {
    logger.debug("[Jellyfin Availability Sync] Failed to parse JSON response", { path, error: String(err) });
    return null;
  }
}

function hasPhysicalFile(item: any) {
  const locationType = String(item?.LocationType ?? "").toLowerCase();
  const itemType = String(item?.Type ?? "").toLowerCase();
  if (locationType === "virtual" || item?.IsVirtual === true) return false;
  if (itemType === "series") return false;

  const mediaSources = Array.isArray(item?.MediaSources) ? item.MediaSources : [];
  const hasMediaSourcePath = mediaSources.some((source: any) => Boolean(source?.Path));
  const hasPath = Boolean(item?.Path);
  return hasMediaSourcePath || hasPath;
}

export async function syncJellyfinAvailability(options?: { logToHistory?: boolean }): Promise<{ scanned: number; added: number; updated: number }> {
  let totalScanned = 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  let scanLogId: number | null = null;

  try {
    const config = await getJellyfinConfig();
    const enabledLibraries = (config.libraries ?? []).filter((lib: any) => lib.enabled);

    if (enabledLibraries.length === 0) {
      logger.info("[Jellyfin Availability Sync] No enabled libraries, skipping");
      return { scanned: 0, added: 0, updated: 0 };
    }

    // Create scan log entry if requested
    if (options?.logToHistory) {
      scanLogId = await startJellyfinScan({ libraryName: "Availability Sync" });
    }

    logger.info("[Jellyfin Availability Sync] Starting availability sync", {
      libraryCount: enabledLibraries.length
    });

    for (const library of enabledLibraries) {
      const result = await syncLibrary(library);
      totalScanned += result.scanned;
      totalAdded += result.added;
      totalUpdated += result.updated;
    }

    logger.info("[Jellyfin Availability Sync] Sync completed", {
      scanned: totalScanned,
      added: totalAdded,
      updated: totalUpdated
    });

    // Update scan log with results
    if (scanLogId) {
      await updateJellyfinScan(scanLogId, {
        itemsScanned: totalScanned,
        itemsAdded: totalAdded,
        scanStatus: "completed"
      });
    }

    return { scanned: totalScanned, added: totalAdded, updated: totalUpdated };
  } catch (err) {
    logger.error("[Jellyfin Availability Sync] Sync failed", err);
    // Log failure if we have a scan log
    if (scanLogId) {
      await updateJellyfinScan(scanLogId, {
        scanStatus: "failed",
        errorMessage: err instanceof Error ? err.message : String(err)
      }).catch(() => {});
    }
    throw err;
  }
}

async function syncLibrary(library: { id: string; name: string; type: "movie" | "show" }): Promise<{
  scanned: number;
  added: number;
  updated: number;
}> {
  let scanned = 0;
  let added = 0;
  let updated = 0;
  const scanStartedAt = new Date();

  try {
    const includeItemTypes = library.type === "movie" ? "Movie" : "Series,Season,Episode";

    // Fetch all items from the library
    const response = await jellyfinFetch(
      `/Items?ParentId=${library.id}&Recursive=true&IncludeItemTypes=${includeItemTypes}&Fields=ProviderIds,ParentId,IndexNumber,ParentIndexNumber,Type,LocationType,MediaSources,Path,IsVirtual,PremiereDate&Limit=10000`
    );

    if (!response || !Array.isArray(response.Items)) {
      logger.warn("[Jellyfin Availability Sync] No items found or invalid response", {
        libraryId: library.id,
        libraryName: library.name
      });
      return { scanned: 0, added: 0, updated: 0 };
    }

    const items = response.Items;
    const seriesById = new Map<string, { tmdbId: number | null; tvdbId: number | null; imdbId: string | null }>();
    const seasonToSeriesId = new Map<string, string>();

    for (const item of items) {
      const itemType = String(item.Type ?? "").toLowerCase();
      const itemId = item.Id ? String(item.Id) : "";
      if (!itemId) continue;

      if (itemType === "series") {
        seriesById.set(itemId, {
          tmdbId: item.ProviderIds?.Tmdb ? Number(item.ProviderIds.Tmdb) : null,
          tvdbId: item.ProviderIds?.Tvdb ? Number(item.ProviderIds.Tvdb) : null,
          imdbId: item.ProviderIds?.Imdb ?? null
        });
      } else if (itemType === "season" && item.ParentId) {
        seasonToSeriesId.set(itemId, String(item.ParentId));
      }
    }
    logger.info("[Jellyfin Availability Sync] Processing library", {
      libraryId: library.id,
      libraryName: library.name,
      itemCount: items.length
    });

    for (const item of items) {
      const jellyfinItemId = item.Id;
      const itemType = String(item.Type ?? "").toLowerCase();
      const title = item.Name ?? null;

      // Extract provider IDs
      let tmdbId = item.ProviderIds?.Tmdb ? Number(item.ProviderIds.Tmdb) : null;
      let tvdbId = item.ProviderIds?.Tvdb ? Number(item.ProviderIds.Tvdb) : null;
      let imdbId = item.ProviderIds?.Imdb ?? null;

      let mediaType: 'movie' | 'episode' | 'season' | 'series';
      let seasonNumber: number | null = null;
      let episodeNumber: number | null = null;
      let airDate: string | null = null;

      if (itemType === "movie") {
        mediaType = "movie";
      } else if (itemType === "series") {
        mediaType = "series";
      } else if (itemType === "season") {
        mediaType = "season";
        seasonNumber = item.IndexNumber ?? null;
      } else if (itemType === "episode") {
        mediaType = "episode";
        seasonNumber = item.ParentIndexNumber ?? null;
        episodeNumber = item.IndexNumber ?? null;
        if (item.PremiereDate) {
          airDate = String(item.PremiereDate).slice(0, 10);
        }
      } else {
        // Skip unknown types
        continue;
      }

      if ((itemType === "movie" || itemType === "episode") && !hasPhysicalFile(item)) {
        continue;
      }

      if (itemType === "episode" || itemType === "season") {
        const parentId = item.ParentId ? String(item.ParentId) : "";
        const seriesId = seasonToSeriesId.get(parentId) ?? (seriesById.has(parentId) ? parentId : "");
        if (seriesId && seriesById.has(seriesId)) {
          const seriesIds = seriesById.get(seriesId)!;
          if (seriesIds.tmdbId) tmdbId = seriesIds.tmdbId;
          if (seriesIds.tvdbId) tvdbId = seriesIds.tvdbId;
          if (seriesIds.imdbId) imdbId = seriesIds.imdbId;
        }
      }

      const result = await upsertJellyfinAvailability({
        tmdbId,
        tvdbId,
        imdbId,
        mediaType,
        title,
        seasonNumber,
        episodeNumber,
        airDate,
        jellyfinItemId,
        jellyfinLibraryId: library.id
      });

      scanned++;
      if (result.isNew) {
        added++;
      } else {
        updated++;
      }
    }

    const pool = getPool();
    const removed = await pool.query(
      `DELETE FROM jellyfin_availability
       WHERE jellyfin_library_id = $1
         AND last_scanned_at < $2
         AND media_type IN ('movie','episode')
       RETURNING 1`,
      [library.id, scanStartedAt]
    );
    if (removed.rowCount) {
      logger.info("[Jellyfin Availability Sync] Removed stale items", {
        libraryId: library.id,
        libraryName: library.name,
        removed: removed.rowCount
      });
    }
  } catch (err) {
    logger.error("[Jellyfin Availability Sync] Error syncing library", {
      libraryId: library.id,
      libraryName: library.name,
      error: String(err)
    });
  }

  return { scanned, added, updated };
}

// Manual trigger for immediate sync (logs to history)
export async function triggerManualAvailabilitySync(): Promise<void> {
  logger.info("[Jellyfin Availability Sync] Manual sync triggered");
  await syncJellyfinAvailability({ logToHistory: true });
}

// Get cached episode availability for a TV show
export async function getCachedEpisodeAvailability(
  tmdbId: number,
  seasonNumber: number,
  tvdbId?: number | null
): Promise<{
  byEpisode: Map<number, { available: boolean; jellyfinItemId: string | null }>;
  byAirDate: Map<string, { available: boolean; jellyfinItemId: string | null }>;
}> {
  const pool = getPool();
  const hasTvdbId = Number(tvdbId ?? 0) > 0;
  const query = hasTvdbId
    ? `SELECT episode_number, air_date, jellyfin_item_id
       FROM jellyfin_availability
       WHERE media_type = 'episode'
         AND season_number = $3
         AND (episode_number IS NOT NULL OR air_date IS NOT NULL)
         AND (tmdb_id = $1 OR tvdb_id = $2)`
    : `SELECT episode_number, air_date, jellyfin_item_id
       FROM jellyfin_availability
       WHERE tmdb_id = $1
         AND media_type = 'episode'
         AND season_number = $2
         AND (episode_number IS NOT NULL OR air_date IS NOT NULL)`;
  const params = hasTvdbId ? [tmdbId, tvdbId, seasonNumber] : [tmdbId, seasonNumber];
  const res = await pool.query(query, params);

  const byEpisode = new Map<number, { available: boolean; jellyfinItemId: string | null }>();
  const byAirDate = new Map<string, { available: boolean; jellyfinItemId: string | null }>();

  for (const row of res.rows) {
    if (row.episode_number !== null) {
      byEpisode.set(row.episode_number, {
        available: true,
        jellyfinItemId: row.jellyfin_item_id
      });
    }
    if (row.air_date) {
      const dateKey = String(row.air_date).slice(0, 10);
      byAirDate.set(dateKey, {
        available: true,
        jellyfinItemId: row.jellyfin_item_id
      });
    }
  }

  return { byEpisode, byAirDate };
}
