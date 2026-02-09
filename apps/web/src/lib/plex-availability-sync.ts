import { getPlexConfig, upsertPlexAvailability, startPlexScan, updatePlexScan } from "@/db";
import { logger } from "@/lib/logger";
import { decryptSecret } from "@/lib/encryption";
import { getPool } from "@/db";
import { validateExternalServiceUrl } from "@/lib/url-validation";
import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  attributesGroupName: "@",
  textNodeName: "#text"
});

type PlexGuidIds = {
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;
};

type PlexItem = {
  ratingKey?: string;
  type?: string;
  title?: string;
  guid?: string;
  parentGuid?: string;
  grandparentGuid?: string;
  parentIndex?: string | number;
  index?: string | number;
  originallyAvailableAt?: string;
  Guid?: Array<{ id?: string } | { [key: string]: any }>;
  [key: string]: any;
};

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getAttr(source: any, key: string): string | null {
  if (!source) return null;
  const direct = source[key];
  if (direct !== undefined && direct !== null) return String(direct);
  const attrs = source["@"];
  if (attrs && attrs[key] !== undefined && attrs[key] !== null) return String(attrs[key]);
  return null;
}

function buildBaseUrl(config: { hostname: string; port: number; useSsl: boolean; urlBase: string }) {
  const host = config.hostname.trim();
  if (!host) return "";

  if (host.includes('://')) {
    logger.error("[Plex Availability Sync] Invalid hostname - contains protocol", { hostname: host });
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

async function getPlexConnection(): Promise<{ baseUrl: string; token: string } | null> {
  const config = await getPlexConfig();
  if (!config.enabled || !config.hostname || !config.tokenEncrypted) return null;
  const baseUrl = buildBaseUrl(config);
  if (!baseUrl) return null;

  try {
    const allowHttp = process.env.PLEX_ALLOW_HTTP === "true";
    const allowPrivateIPs = process.env.PLEX_ALLOW_PRIVATE_IPS === "true";
    const allowedCidrs = process.env.PLEX_ALLOWED_CIDRS?.split(",").map(part => part.trim()).filter(Boolean);
    validateExternalServiceUrl(baseUrl, "Plex Availability Sync", {
      allowHttp,
      allowPrivateIPs,
      allowedCidrs,
      requireHttps: !allowHttp && process.env.NODE_ENV === "production"
    });
  } catch (err) {
    logger.error("[Plex Availability Sync] URL validation failed", err);
    return null;
  }

  try {
    const token = decryptSecret(config.tokenEncrypted);
    return { baseUrl, token };
  } catch (err) {
    logger.error("[Plex Availability Sync] Failed to decrypt token", err);
    return null;
  }
}

async function plexFetchXml(path: string) {
  const connection = await getPlexConnection();
  if (!connection) return null;
  const baseUrl = connection.baseUrl.replace(/\/+$/, "");
  const url = new URL(baseUrl + path);
  url.searchParams.set("X-Plex-Token", connection.token);
  const res = await fetch(url, { headers: { Accept: "application/xml" }, cache: "no-store" });
  if (!res.ok) return null;
  try {
    const xml = await res.text();
    return xmlParser.parse(xml);
  } catch (err) {
    logger.debug("[Plex Availability Sync] Failed to parse XML response", { path, error: String(err) });
    return null;
  }
}

function parseGuidIds(item: PlexItem): PlexGuidIds {
  const ids: PlexGuidIds = { tmdbId: null, tvdbId: null, imdbId: null };
  const guidCandidates: string[] = [];

  const guidList = toArray(item.Guid).map((g: any) => getAttr(g, "id") ?? g?.id).filter(Boolean) as string[];
  guidCandidates.push(...guidList);

  const directGuid = getAttr(item, "guid");
  const parentGuid = getAttr(item, "parentGuid");
  const grandparentGuid = getAttr(item, "grandparentGuid");
  [directGuid, parentGuid, grandparentGuid].filter(Boolean).forEach((g) => guidCandidates.push(String(g)));

  for (const guid of guidCandidates) {
    if (!ids.tmdbId) {
      const match = guid.match(/tmdb:\/\/(\d+)/i);
      if (match) ids.tmdbId = Number(match[1]);
    }
    if (!ids.tvdbId) {
      const match = guid.match(/tvdb:\/\/(\d+)/i);
      if (match) ids.tvdbId = Number(match[1]);
    }
    if (!ids.imdbId) {
      const match = guid.match(/imdb:\/\/(tt\d+)/i);
      if (match) ids.imdbId = match[1];
    }
  }

  return ids;
}

async function fetchPlexLibraryItems(libraryId: string, itemType: number): Promise<PlexItem[]> {
  const items: PlexItem[] = [];
  let start = 0;
  const pageSize = 500;
  let totalSize = 0;

  while (start === 0 || (totalSize && start < totalSize)) {
    const response = await plexFetchXml(
      `/library/sections/${libraryId}/all?type=${itemType}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`
    );
    if (!response?.MediaContainer) break;

    const container = response.MediaContainer;
    const metadata = toArray(container.Metadata) as PlexItem[];
    items.push(...metadata);

    const total = Number(getAttr(container, "totalSize") ?? getAttr(container, "size") ?? 0);
    if (total) totalSize = total;
    if (metadata.length < pageSize) break;
    start += pageSize;
  }

  return items;
}

export async function syncPlexAvailability(options?: { logToHistory?: boolean }): Promise<{ scanned: number; added: number; updated: number }> {
  let totalScanned = 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  let scanLogId: number | null = null;

  try {
    const config = await getPlexConfig();
    if (!config.enabled) {
      logger.info("[Plex Availability Sync] Plex disabled, skipping");
      return { scanned: 0, added: 0, updated: 0 };
    }

    const enabledLibraries = (config.libraries ?? []).filter((lib: any) => lib.enabled);
    if (enabledLibraries.length === 0) {
      logger.info("[Plex Availability Sync] No enabled libraries, skipping");
      return { scanned: 0, added: 0, updated: 0 };
    }

    if (options?.logToHistory) {
      scanLogId = await startPlexScan({ libraryName: "Availability Sync" });
    }

    logger.info("[Plex Availability Sync] Starting availability sync", {
      libraryCount: enabledLibraries.length
    });

    for (const library of enabledLibraries) {
      const result = await syncLibrary(library);
      totalScanned += result.scanned;
      totalAdded += result.added;
      totalUpdated += result.updated;
    }

    logger.info("[Plex Availability Sync] Sync completed", {
      scanned: totalScanned,
      added: totalAdded,
      updated: totalUpdated
    });

    if (scanLogId) {
      await updatePlexScan(scanLogId, {
        itemsScanned: totalScanned,
        itemsAdded: totalAdded,
        scanStatus: "completed"
      });
    }

    return { scanned: totalScanned, added: totalAdded, updated: totalUpdated };
  } catch (err) {
    logger.error("[Plex Availability Sync] Sync failed", err);
    if (scanLogId) {
      await updatePlexScan(scanLogId, {
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
    const itemType = library.type === "movie" ? 1 : 4;
    const items = await fetchPlexLibraryItems(library.id, itemType);
    if (!items.length) {
      logger.warn("[Plex Availability Sync] No items found", {
        libraryId: library.id,
        libraryName: library.name
      });
      return { scanned: 0, added: 0, updated: 0 };
    }

    logger.info("[Plex Availability Sync] Processing library", {
      libraryId: library.id,
      libraryName: library.name,
      itemCount: items.length
    });

    for (const item of items) {
      const plexItemId = getAttr(item, "ratingKey") ?? item.ratingKey;
      const itemType = String(getAttr(item, "type") ?? item.type ?? "").toLowerCase();
      if (!plexItemId) continue;

      const ids = parseGuidIds(item);
      const title = getAttr(item, "title") ?? item.title ?? null;
      const seasonNumber = itemType === "episode" ? Number(getAttr(item, "parentIndex") ?? item.parentIndex ?? NaN) : null;
      const episodeNumber = itemType === "episode" ? Number(getAttr(item, "index") ?? item.index ?? NaN) : null;
      const airDate = getAttr(item, "originallyAvailableAt") ?? item.originallyAvailableAt ?? null;
      const mediaType = itemType === "movie" ? "movie" : itemType === "episode" ? "episode" : itemType === "season" ? "season" : "series";

      const result = await upsertPlexAvailability({
        tmdbId: ids.tmdbId,
        tvdbId: ids.tvdbId,
        imdbId: ids.imdbId,
        mediaType,
        title,
        seasonNumber: Number.isFinite(seasonNumber as number) ? seasonNumber : null,
        episodeNumber: Number.isFinite(episodeNumber as number) ? episodeNumber : null,
        airDate,
        plexItemId: String(plexItemId),
        plexLibraryId: library.id
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
      `DELETE FROM plex_availability
       WHERE plex_library_id = $1
         AND last_scanned_at < $2
         AND media_type IN ('movie','episode')
       RETURNING 1`,
      [library.id, scanStartedAt]
    );
    if (removed.rowCount) {
      logger.info("[Plex Availability Sync] Removed stale items", {
        libraryId: library.id,
        libraryName: library.name,
        removed: removed.rowCount
      });
    }
  } catch (err) {
    logger.error("[Plex Availability Sync] Error syncing library", {
      libraryId: library.id,
      libraryName: library.name,
      error: String(err)
    });
  }

  return { scanned, added, updated };
}

export async function triggerManualPlexAvailabilitySync(): Promise<void> {
  logger.info("[Plex Availability Sync] Manual sync triggered");
  await syncPlexAvailability({ logToHistory: true });
}
