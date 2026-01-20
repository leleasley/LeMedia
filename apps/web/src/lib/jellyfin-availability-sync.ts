import { getJellyfinConfig, upsertJellyfinAvailability } from "@/db";
import { logger } from "@/lib/logger";
import { decryptSecret } from "@/lib/encryption";
import { getPool } from "@/db";

async function getJellyfinConnection(): Promise<{ baseUrl: string; apiKey: string } | null> {
  const config = await getJellyfinConfig();
  if (!config.hostname || !config.apiKeyEncrypted) return null;
  const baseUrl = buildBaseUrl(config);
  if (!baseUrl) return null;
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

export async function syncJellyfinAvailability(): Promise<{ scanned: number; added: number; updated: number }> {
  let totalScanned = 0;
  let totalAdded = 0;
  let totalUpdated = 0;

  try {
    const config = await getJellyfinConfig();
    const enabledLibraries = (config.libraries ?? []).filter((lib: any) => lib.enabled);

    if (enabledLibraries.length === 0) {
      logger.info("[Jellyfin Availability Sync] No enabled libraries, skipping");
      return { scanned: 0, added: 0, updated: 0 };
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

    return { scanned: totalScanned, added: totalAdded, updated: totalUpdated };
  } catch (err) {
    logger.error("[Jellyfin Availability Sync] Sync failed", err);
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

  try {
    const includeItemTypes = library.type === "movie" ? "Movie" : "Series,Episode";

    // Fetch all items from the library
    const response = await jellyfinFetch(
      `/Items?ParentId=${library.id}&Recursive=true&IncludeItemTypes=${includeItemTypes}&Fields=ProviderIds,ParentId,IndexNumber,ParentIndexNumber,Type&Limit=10000`
    );

    if (!response || !Array.isArray(response.Items)) {
      logger.warn("[Jellyfin Availability Sync] No items found or invalid response", {
        libraryId: library.id,
        libraryName: library.name
      });
      return { scanned: 0, added: 0, updated: 0 };
    }

    const items = response.Items;
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
      const tmdbId = item.ProviderIds?.Tmdb ? Number(item.ProviderIds.Tmdb) : null;
      const tvdbId = item.ProviderIds?.Tvdb ? Number(item.ProviderIds.Tvdb) : null;
      const imdbId = item.ProviderIds?.Imdb ?? null;

      let mediaType: 'movie' | 'episode' | 'season' | 'series';
      let seasonNumber: number | null = null;
      let episodeNumber: number | null = null;

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
      } else {
        // Skip unknown types
        continue;
      }

      const result = await upsertJellyfinAvailability({
        tmdbId,
        tvdbId,
        imdbId,
        mediaType,
        title,
        seasonNumber,
        episodeNumber,
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
  } catch (err) {
    logger.error("[Jellyfin Availability Sync] Error syncing library", {
      libraryId: library.id,
      libraryName: library.name,
      error: String(err)
    });
  }

  return { scanned, added, updated };
}

// Manual trigger for immediate sync
export async function triggerManualAvailabilitySync(): Promise<void> {
  logger.info("[Jellyfin Availability Sync] Manual sync triggered");
  await syncJellyfinAvailability();
}

// Get cached episode availability for a TV show
export async function getCachedEpisodeAvailability(
  tmdbId: number,
  seasonNumber: number
): Promise<Map<number, { available: boolean; jellyfinItemId: string | null }>> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT episode_number, jellyfin_item_id
     FROM jellyfin_availability
     WHERE tmdb_id = $1
       AND media_type = 'episode'
       AND season_number = $2
       AND episode_number IS NOT NULL`,
    [tmdbId, seasonNumber]
  );

  const availabilityMap = new Map<number, { available: boolean; jellyfinItemId: string | null }>();

  for (const row of res.rows) {
    if (row.episode_number !== null) {
      availabilityMap.set(row.episode_number, {
        available: true,
        jellyfinItemId: row.jellyfin_item_id
      });
    }
  }

  return availabilityMap;
}
