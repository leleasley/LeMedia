import { z } from "zod";
import { getMovie, tmdbImageUrl } from "./tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { ActiveMediaService, getActiveMediaService, getMediaServiceByIdWithKey } from "./media-services";
import { baseFetch } from "./fetch-utils";

const normalizeUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, "");

export function createRadarrFetcher(baseUrl: string, apiKey: string) {
  const root = normalizeUrl(baseUrl);
  return (path: string, init?: RequestInit) => baseFetch(root, path, apiKey, init, "Radarr");
}

export function listRadarrQualityProfilesForService(baseUrl: string, apiKey: string) {
  return createRadarrFetcher(baseUrl, apiKey)("/api/v3/qualityprofile");
}

export function listRadarrRootFoldersForService(baseUrl: string, apiKey: string) {
  return createRadarrFetcher(baseUrl, apiKey)("/api/v3/rootfolder");
}

export function listRadarrTagsForService(baseUrl: string, apiKey: string) {
  return createRadarrFetcher(baseUrl, apiKey)("/api/v3/tag");
}

type RadarrConfig = {
  baseUrl: string;
  apiKey: string;
  rootFolder: string;
  qualityProfileId: number;
  minimumAvailability: string;
};

const requireString = (value: unknown, label: string) => {
  const result = z.string().min(1).safeParse(value ?? "");
  if (!result.success) {
    throw new Error(`Radarr ${label} is not configured`);
  }
  return result.data;
};

const parseNumber = (value: unknown, label: string) => {
  const result = z.coerce.number().int().safeParse(value);
  if (!result.success) {
    throw new Error(`Radarr ${label} must be a number`);
  }
  return result.data;
};

let cachedRadarrConfig: Promise<RadarrConfig> | null = null;
function buildRadarrConfigFromService(service: ActiveMediaService): RadarrConfig {
  const baseUrl = service.base_url.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Radarr base URL is not configured");
  }
  const config = service.config as Record<string, unknown>;
  return {
    baseUrl,
    apiKey: service.apiKey,
    rootFolder: requireString(config.rootFolder, "root folder"),
    qualityProfileId: parseNumber(
      config.qualityProfileId ?? config.qualityProfile,
      "quality profile"
    ),
    minimumAvailability: (config.minimumAvailability as string) ?? "released"
  };
}

function getRadarrConfig(service?: ActiveMediaService) {
  if (service) {
    return buildRadarrConfigFromService(service);
  }
  if (cachedRadarrConfig) return cachedRadarrConfig;
  cachedRadarrConfig = loadRadarrConfig();
  return cachedRadarrConfig;
}

type CacheEntry<T> = { expiresAt: number; promise: Promise<T> };
const QUALITY_TTL_MS = 5 * 60 * 1000;
const MOVIES_TTL_MS = 30 * 1000;
let qualityProfilesCache: CacheEntry<any> | null = null;
let radarrMoviesCache: CacheEntry<any> | null = null;

async function loadRadarrConfig(): Promise<RadarrConfig> {
  const service = await getActiveMediaService("radarr");
  if (!service) {
    throw new Error("No Radarr service is configured");
  }
  return buildRadarrConfigFromService(service);
}

async function radarrFetch(path: string, init?: RequestInit) {
  const cfg = await getRadarrConfig();
  return baseFetch(cfg.baseUrl, path, cfg.apiKey, init, "Radarr");
}

export async function radarrStatus() {
  return radarrFetch("/api/v3/system/status");
}

export async function radarrLogs(page = 1, pageSize = 50) {
  return radarrFetch(`/api/v3/log?sortKey=time&sortDirection=descending&page=${page}&pageSize=${pageSize}`);
}

export async function listRadarrMovies() {
  const now = Date.now();
  if (radarrMoviesCache && radarrMoviesCache.expiresAt > now) {
    return radarrMoviesCache.promise;
  }
  const promise = radarrFetch("/api/v3/movie");
  radarrMoviesCache = { expiresAt: now + MOVIES_TTL_MS, promise };
  return promise;
}

export async function radarrQueue(page = 1, pageSize = 50) {
  return radarrFetch(`/api/v3/queue?page=${page}&pageSize=${pageSize}&includeMovie=true`);
}

export async function listRadarrQualityProfiles() {
  const now = Date.now();
  if (qualityProfilesCache && qualityProfilesCache.expiresAt > now) {
    return qualityProfilesCache.promise;
  }
  const promise = radarrFetch("/api/v3/qualityprofile");
  qualityProfilesCache = { expiresAt: now + QUALITY_TTL_MS, promise };
  return promise;
}

async function resolveRootFolderPath(
  cfg: RadarrConfig,
  fetcher: (path: string, init?: RequestInit) => Promise<any>,
  overridePath?: string
) {
  const desired = overridePath ?? cfg.rootFolder;
  const roots = await fetcher("/api/v3/rootfolder");
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error("No Radarr root folders are configured");
  }
  const match = roots.find((r: any) => r?.path === desired);
  return (match || roots[0]).path as string;
}

function slugifyTitle(title: string, tmdbId: number) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
  return `${base || "movie"}-${tmdbId}`;
}

export async function addMovie(
  tmdbId: number,
  qualityProfileId?: number,
  movie?: any,
  overrides?: {
    serviceId?: number;
    rootFolder?: string;
    tags?: number[];
  }
) {
  const customService =
    overrides?.serviceId !== undefined && overrides.serviceId !== null
      ? await getMediaServiceByIdWithKey(overrides.serviceId)
      : null;
  if (overrides?.serviceId !== undefined && overrides?.serviceId !== null && !customService) {
    throw new Error("Radarr service not found");
  }
  const cfg = await getRadarrConfig(customService ?? undefined);
  const fetcher = customService ? createRadarrFetcher(customService.base_url, customService.apiKey) : radarrFetch;
  const tmdbMovie = movie ?? (await getMovie(tmdbId));
  const title = tmdbMovie?.title || tmdbMovie?.original_title || `TMDB ${tmdbId}`;
  const year = tmdbMovie?.release_date ? Number(String(tmdbMovie.release_date).slice(0, 4)) : undefined;
  const imageProxyEnabled = await getImageProxyEnabled();
  const poster = tmdbImageUrl(tmdbMovie?.poster_path, "original", imageProxyEnabled);
  const images = poster ? [{ coverType: "poster", url: poster }] : [];
  const rootFolderPath = await resolveRootFolderPath(cfg, fetcher, overrides?.rootFolder);

  // Typical v3 payload includes rootFolderPath, qualityProfileId, monitored, addOptions.searchForMovie.
  const payload: Record<string, unknown> = {
    title,
    tmdbId,
    year,
    titleSlug: slugifyTitle(title, tmdbId),
    images,
    rootFolderPath,
    qualityProfileId: qualityProfileId ?? cfg.qualityProfileId,
    monitored: true,
    minimumAvailability: cfg.minimumAvailability,
    addOptions: { searchForMovie: true }
  };
  if (overrides?.tags?.length) {
    payload.tags = overrides.tags;
  }

  return fetcher("/api/v3/movie", { method: "POST", body: JSON.stringify(payload) });
}

export async function getMovieByTmdbId(tmdbId: number) {
  try {
    const movies = await radarrFetch(`/api/v3/movie?tmdbId=${tmdbId}`);
    if (Array.isArray(movies) && movies.length > 0) {
      return movies[0];
    }
    return null;
  } catch (e) {
    // If 404 or other error, return null (assuming not found or service down, but strictly for existence check)
    // However, if service is down, we might want to throw.
    // For now, let's assume if it fails, we treat it as not found or handle upstream.
    // But Radarr 404s on list endpoint? Unlikely.
    return null;
  }
}

export async function getRadarrMovie(movieId: number) {
  return radarrFetch(`/api/v3/movie/${movieId}`);
}

export async function deleteMovie(movieId: number, options?: { deleteFiles?: boolean; addExclusion?: boolean }) {
  const params = new URLSearchParams();
  if (options?.deleteFiles !== undefined) params.set("deleteFiles", String(options.deleteFiles));
  if (options?.addExclusion !== undefined) params.set("addExclusion", String(options.addExclusion));
  const query = params.toString();
  return radarrFetch(`/api/v3/movie/${movieId}${query ? `?${query}` : ""}`, {
    method: "DELETE"
  });
}
