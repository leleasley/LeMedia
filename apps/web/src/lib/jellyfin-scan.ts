import { getJellyfinConfig } from "@/db";
import { upsertJellyfinAvailability, startJellyfinScan, updateJellyfinScan } from "@/db";
import { logger } from "@/lib/logger";
import { decryptSecret } from "@/lib/encryption";

type JellyfinLibrary = {
  id: string;
  name: string;
  type: "movie" | "show";
  enabled: boolean;
  lastScan?: number;
};

type ScanStatus = {
  running: boolean;
  progress: number;
  total: number;
  currentLibrary: JellyfinLibrary | null;
  libraries: JellyfinLibrary[];
  newItemsCount: number;
};

const scanState: ScanStatus = {
  running: false,
  progress: 0,
  total: 0,
  currentLibrary: null,
  libraries: [],
  newItemsCount: 0
};

async function getJellyfinConnection(): Promise<{ baseUrl: string; apiKey: string } | null> {
  const config = await getJellyfinConfig();
  if (!config.hostname || !config.apiKeyEncrypted) return null;
  const baseUrl = buildBaseUrl(config);
  if (!baseUrl) return null;
  try {
    const apiKey = decryptSecret(config.apiKeyEncrypted);
    return { baseUrl, apiKey };
  } catch (err) {
    logger.error("[Jellyfin Scan] Failed to decrypt API key", err);
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
    logger.debug("[Jellyfin Scan] Failed to parse JSON response", { path, error: String(err) });
    return null;
  }
}

export async function getJellyfinScanStatus(): Promise<ScanStatus> {
  const config = await getJellyfinConfig();
  return {
    ...scanState,
    libraries: config.libraries ?? []
  };
}

export async function startJellyfinLibraryScan(): Promise<void> {
  if (scanState.running) return;

  const config = await getJellyfinConfig();
  const enabledLibraries = (config.libraries ?? []).filter((lib: JellyfinLibrary) => lib.enabled);

  scanState.running = true;
  scanState.progress = 0;
  scanState.total = enabledLibraries.length;
  scanState.currentLibrary = null;
  scanState.libraries = config.libraries ?? [];
  scanState.newItemsCount = 0;

  if (!enabledLibraries.length) {
    scanState.running = false;
    return;
  }

  logger.info("[Jellyfin Scan] Starting manual library scan", {
    libraryCount: enabledLibraries.length
  });

  (async () => {
    const scanId = await startJellyfinScan({
      libraryId: null,
      libraryName: "All Enabled Libraries"
    });

    let totalScanned = 0;
    let totalAdded = 0;

    try {
      for (const library of enabledLibraries) {
        if (!scanState.running) break;

        scanState.currentLibrary = library;
        scanState.progress += 1;

        logger.info("[Jellyfin Scan] Scanning library", {
          libraryId: library.id,
          libraryName: library.name,
          libraryType: library.type
        });

        const result = await scanLibrary(library);
        totalScanned += result.itemsScanned;
        totalAdded += result.itemsAdded;
        scanState.newItemsCount += result.itemsAdded;

        logger.info("[Jellyfin Scan] Library scan complete", {
          libraryId: library.id,
          libraryName: library.name,
          itemsScanned: result.itemsScanned,
          itemsAdded: result.itemsAdded
        });

        // Update the library's lastScan timestamp in config
        const updatedLibraries = (config.libraries ?? []).map((lib: JellyfinLibrary) =>
          lib.id === library.id ? { ...lib, lastScan: Date.now() } : lib
        );
        config.libraries = updatedLibraries;
      }

      await updateJellyfinScan(scanId, {
        itemsScanned: totalScanned,
        itemsAdded: totalAdded,
        scanStatus: "completed"
      });

      logger.info("[Jellyfin Scan] Manual library scan completed", {
        totalScanned,
        totalAdded
      });
    } catch (err) {
      logger.error("[Jellyfin Scan] Failed during manual scan", { error: String(err) });
      await updateJellyfinScan(scanId, {
        scanStatus: "failed",
        errorMessage: String(err)
      });
    } finally {
      scanState.running = false;
      scanState.currentLibrary = null;
    }
  })();
}

async function scanLibrary(library: JellyfinLibrary): Promise<{ itemsScanned: number; itemsAdded: number }> {
  let itemsScanned = 0;
  let itemsAdded = 0;

  try {
    const includeItemTypes = library.type === "movie" ? "Movie" : "Series,Episode";

    // Fetch all items from the library
    const response = await jellyfinFetch(
      `/Items?ParentId=${library.id}&Recursive=true&IncludeItemTypes=${includeItemTypes}&Fields=ProviderIds,ParentId,IndexNumber,ParentIndexNumber,Type&Limit=10000`
    );

    if (!response || !Array.isArray(response.Items)) {
      logger.warn("[Jellyfin Scan] No items found or invalid response", {
        libraryId: library.id,
        libraryName: library.name
      });
      return { itemsScanned: 0, itemsAdded: 0 };
    }

    const items = response.Items;
    logger.info("[Jellyfin Scan] Found items in library", {
      libraryId: library.id,
      libraryName: library.name,
      itemCount: items.length
    });

    for (const item of items) {
      if (!scanState.running) break;

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

      itemsScanned++;
      if (result.isNew) {
        itemsAdded++;
        logger.debug("[Jellyfin Scan] New item added", {
          jellyfinItemId,
          title,
          mediaType,
          tmdbId
        });
      }
    }
  } catch (err) {
    logger.error("[Jellyfin Scan] Error scanning library", {
      libraryId: library.id,
      libraryName: library.name,
      error: String(err)
    });
  }

  return { itemsScanned, itemsAdded };
}

export function cancelJellyfinLibraryScan(): void {
  if (!scanState.running) return;
  scanState.running = false;
  scanState.currentLibrary = null;
  logger.info("[Jellyfin Scan] Manual library scan cancelled");
}
