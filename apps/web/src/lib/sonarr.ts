import { z } from "zod";
import { ActiveMediaService, getActiveMediaService, getMediaServiceByIdWithKey } from "./media-services";
import { baseFetch } from "./fetch-utils";

const normalizeSonarrUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, "");

export function createSonarrFetcher(baseUrl: string, apiKey: string) {
  const root = normalizeSonarrUrl(baseUrl);
  return (path: string, init?: RequestInit) => baseFetch(root, path, apiKey, init, "Sonarr");
}

export function listSonarrQualityProfilesForService(baseUrl: string, apiKey: string) {
  return createSonarrFetcher(baseUrl, apiKey)("/api/v3/qualityprofile");
}

export function listSonarrRootFoldersForService(baseUrl: string, apiKey: string) {
  return createSonarrFetcher(baseUrl, apiKey)("/api/v3/rootfolder");
}

export function listSonarrTagsForService(baseUrl: string, apiKey: string) {
  return createSonarrFetcher(baseUrl, apiKey)("/api/v3/tag");
}

export function listSonarrLanguageProfilesForService(baseUrl: string, apiKey: string) {
  return createSonarrFetcher(baseUrl, apiKey)("/api/v3/languageprofile");
}

export function lookupSeriesByTvdbForService(baseUrl: string, apiKey: string, tvdbId: number) {
  return createSonarrFetcher(baseUrl, apiKey)(`/api/v3/series/lookup?term=${encodeURIComponent(`tvdb:${tvdbId}`)}`);
}

type SonarrConfig = {
  baseUrl: string;
  apiKey: string;
  rootFolder: string;
  qualityProfileId: number;
  languageProfileId?: number;
  seriesType: string;
  seasonFolder: boolean;
};

type SonarrConnection = {
  baseUrl: string;
  apiKey: string;
};

const requireString = (value: unknown, label: string) => {
  const result = z.string().min(1).safeParse(value ?? "");
  if (!result.success) {
    throw new Error(`Sonarr ${label} is not configured`);
  }
  return result.data;
};

const parseNumber = (value: unknown, label: string) => {
  const result = z.coerce.number().int().safeParse(value);
  if (!result.success) {
    throw new Error(`Sonarr ${label} must be a number`);
  }
  return result.data;
};

let cachedSonarrConfig: Promise<SonarrConfig> | null = null;
function buildSonarrConfigFromService(service: ActiveMediaService): SonarrConfig {
  const baseUrl = service.base_url.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Sonarr base URL is not configured");
  }

  const config = service.config as Record<string, unknown>;
  const seasonFolderValue =
    typeof config.seasonFolders === "boolean"
      ? config.seasonFolders
      : typeof config.seasonFolder === "boolean"
      ? config.seasonFolder
      : true;

  return {
    baseUrl,
    apiKey: service.apiKey,
    rootFolder: requireString(config.rootFolder, "root folder"),
    qualityProfileId: parseNumber(config.qualityProfileId ?? config.qualityProfile, "quality profile"),
    languageProfileId: config.languageProfileId ? parseNumber(config.languageProfileId, "language profile") : undefined,
    seriesType: (config.seriesType as string) ?? "standard",
    seasonFolder: seasonFolderValue
  };
}

function getSonarrConfig(service?: ActiveMediaService) {
  if (service) {
    return buildSonarrConfigFromService(service);
  }
  if (cachedSonarrConfig) return cachedSonarrConfig;
  cachedSonarrConfig = loadSonarrConfig();
  return cachedSonarrConfig;
}

type CacheEntry<T> = { expiresAt: number; promise: Promise<T> };
const QUALITY_TTL_MS = 5 * 60 * 1000;
const SERIES_TTL_MS = 30 * 1000;
let qualityProfilesCache: CacheEntry<any> | null = null;
let seriesCache: CacheEntry<any> | null = null;

async function loadSonarrConfig(): Promise<SonarrConfig> {
  const service = await getActiveMediaService("sonarr");
  if (!service) {
    throw new Error("No Sonarr service is configured");
  }

  return buildSonarrConfigFromService(service);
}

async function getSonarrConnection(): Promise<SonarrConnection> {
  const service = await getActiveMediaService("sonarr");
  if (!service) {
    throw new Error("No Sonarr service is configured");
  }

  const baseUrl = service.base_url.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Sonarr base URL is not configured");
  }

  return {
    baseUrl,
    apiKey: service.apiKey
  };
}

async function sonarrFetch(path: string, init?: RequestInit) {
  const cfg = await getSonarrConfig();
  return baseFetch(cfg.baseUrl, path, cfg.apiKey, init, "Sonarr");
}

async function sonarrConnectionFetch(path: string, init?: RequestInit) {
  const cfg = await getSonarrConnection();
  return baseFetch(cfg.baseUrl, path, cfg.apiKey, init, "Sonarr");
}

export async function sonarrStatus() {
  return sonarrFetch("/api/v3/system/status");
}

export async function sonarrLogs(page = 1, pageSize = 50) {
  return sonarrFetch(`/api/v3/log?sortKey=time&sortDirection=descending&page=${page}&pageSize=${pageSize}`);
}

export async function sonarrQueue(page = 1, pageSize = 50) {
  return sonarrFetch(`/api/v3/queue?page=${page}&pageSize=${pageSize}&includeSeries=true`);
}

export async function lookupSeriesByTvdb(tvdbId: number) {
  // Sonarr supports term=tvdb:12345 in series lookup.
  return sonarrFetch(`/api/v3/series/lookup?term=${encodeURIComponent(`tvdb:${tvdbId}`)}`);
}

export async function listSeries() {
  const now = Date.now();
  if (seriesCache && seriesCache.expiresAt > now) {
    return seriesCache.promise;
  }
  const promise = sonarrFetch("/api/v3/series");
  seriesCache = { expiresAt: now + SERIES_TTL_MS, promise };
  return promise;
}

export async function listSonarrQualityProfiles() {
  const now = Date.now();
  if (qualityProfilesCache && qualityProfilesCache.expiresAt > now) {
    return qualityProfilesCache.promise;
  }
  const promise = sonarrConnectionFetch("/api/v3/qualityprofile");
  qualityProfilesCache = { expiresAt: now + QUALITY_TTL_MS, promise };
  return promise;
}

async function resolveSonarrRootFolderPath(
  cfg: SonarrConfig,
  fetcher: (path: string, init?: RequestInit) => Promise<any>,
  overridePath?: string
) {
  const desired = overridePath ?? cfg.rootFolder;
  const roots = await fetcher("/api/v3/rootfolder");
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error("No Sonarr root folders are configured");
  }
  const match = roots.find((r: any) => r?.path === desired);
  return (match || roots[0]).path as string;
}

export async function addSeriesFromLookup(
  lookup: any,
  monitored = false,
  qualityProfileId?: number,
  overrides?: {
    serviceId?: number;
    rootFolder?: string;
    tags?: number[];
    languageProfileId?: number;
  }
) {
  const customService =
    overrides?.serviceId !== undefined && overrides.serviceId !== null
      ? await getMediaServiceByIdWithKey(overrides.serviceId)
      : null;
  if (overrides?.serviceId !== undefined && overrides?.serviceId !== null && !customService) {
    throw new Error("Sonarr service not found");
  }
  const cfg = await getSonarrConfig(customService ?? undefined);
  const fetcher = customService ? createSonarrFetcher(customService.base_url, customService.apiKey) : sonarrFetch;
  const rootFolderPath = await resolveSonarrRootFolderPath(cfg, fetcher, overrides?.rootFolder);
  const payload: Record<string, unknown> = {
    ...lookup,
    rootFolderPath,
    qualityProfileId: qualityProfileId ?? lookup.qualityProfileId ?? cfg.qualityProfileId,
    languageProfileId: overrides?.languageProfileId ?? lookup.languageProfileId ?? cfg.languageProfileId,
    seriesType: cfg.seriesType,
    seasonFolder: cfg.seasonFolder,
    monitored,
    addOptions: {
      searchForMissingEpisodes: false,
      searchForCutoffUnmetEpisodes: false
    }
  };

  if (overrides?.tags?.length) {
    payload.tags = overrides.tags;
  } else if (Array.isArray(lookup.tags)) {
    payload.tags = lookup.tags;
  }

  if (!monitored && Array.isArray(payload.seasons)) {
    payload.seasons = payload.seasons.map((s: any) => ({ ...s, monitored: false }));
  }

  const response = await fetcher("/api/v3/series", { method: "POST", body: JSON.stringify(payload) });

  // If we're adding unmonitored by default, force seasons unmonitored too.
  const data = response;
  return data;
}

export async function seriesSearch(
  seriesId: number,
  fetcher: (path: string, init?: RequestInit) => Promise<any> = sonarrFetch
) {
  return fetcher("/api/v3/command", {
    method: "POST",
    body: JSON.stringify({ name: "SeriesSearch", seriesId })
  });
}

export async function getEpisodesForSeries(seriesId: number) {
  // Common Sonarr endpoint.
  return sonarrFetch(`/api/v3/episode?seriesId=${seriesId}`);
}

export async function setEpisodeMonitored(episodeIds: number[], monitored: boolean) {
  // Sonarr has an endpoint to update monitored status for a batch of episode IDs.
  // Many clients call PUT /api/v3/episode/monitor with { episodeIds: [...], monitored: true }.
  return sonarrFetch("/api/v3/episode/monitor", {
    method: "PUT",
    body: JSON.stringify({ episodeIds, monitored })
  });
}

export async function episodeSearch(episodeIds: number[]) {
  return sonarrFetch("/api/v3/command", {
    method: "POST",
    body: JSON.stringify({ name: "EpisodeSearch", episodeIds })
  });
}

export async function getSeriesByTvdbId(tvdbId: number) {
  try {
    const series = await sonarrFetch(`/api/v3/series?tvdbId=${tvdbId}`);
    if (Array.isArray(series) && series.length > 0) {
      return series[0];
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSeriesByTmdbId(tmdbId: number) {
  try {
    const series = await sonarrFetch(`/api/v3/series?tmdbId=${tmdbId}`);
    if (Array.isArray(series) && series.length > 0) {
      return series[0];
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSeries(seriesId: number) {
  return sonarrFetch(`/api/v3/series/${seriesId}`);
}

export async function deleteSeries(seriesId: number, options?: { deleteFiles?: boolean; addExclusion?: boolean }) {
  const params = new URLSearchParams();
  if (options?.deleteFiles !== undefined) params.set("deleteFiles", String(options.deleteFiles));
  if (options?.addExclusion !== undefined) params.set("addExclusion", String(options.addExclusion));
  const query = params.toString();
  return sonarrFetch(`/api/v3/series/${seriesId}${query ? `?${query}` : ""}`, { method: "DELETE" });
}

export async function deleteQueueItem(queueId: number) {
  return sonarrFetch(`/api/v3/queue/${queueId}`, {
    method: "DELETE"
  });
}

/**
 * Get Sonarr calendar for a date range
 * @param start - Start date (ISO format: YYYY-MM-DD)
 * @param end - End date (ISO format: YYYY-MM-DD)
 * @param includeUnmonitored - Include unmonitored episodes
 * @returns Array of episodes with air dates in the range
 */
export async function getSonarrCalendar(start: string, end: string, includeUnmonitored = false) {
  const params = new URLSearchParams({
    start,
    end,
    unmonitored: String(includeUnmonitored),
    includeSeries: "true"
  });
  return sonarrFetch(`/api/v3/calendar?${params.toString()}`);
}

/**
 * Get Sonarr calendar for service by ID
 * @param baseUrl - Sonarr instance base URL
 * @param apiKey - Sonarr API key
 * @param start - Start date (ISO format: YYYY-MM-DD)
 * @param end - End date (ISO format: YYYY-MM-DD)
 * @param includeUnmonitored - Include unmonitored episodes
 */
export async function getSonarrCalendarForService(
  baseUrl: string,
  apiKey: string,
  start: string,
  end: string,
  includeUnmonitored = false
) {
  const fetcher = createSonarrFetcher(baseUrl, apiKey);
  const params = new URLSearchParams({
    start,
    end,
    unmonitored: String(includeUnmonitored)
  });
  return fetcher(`/api/v3/calendar?${params.toString()}`);
}

/**
 * Get upcoming monitored episodes from Sonarr
 * Convenience wrapper around getSonarrCalendar that only returns monitored content
 */
export async function getSonarrUpcoming(start: string, end: string) {
  const calendar = await getSonarrCalendar(start, end, false);
  return Array.isArray(calendar) ? calendar : [];
}
