import { decryptSecret } from "@/lib/encryption";
import { getJellyfinConfig } from "@/db";
import { logger } from "@/lib/logger";

// Simple in-memory cache for availability lookups
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, { expiresAt: number; value: boolean }>();
const itemIdCache = new Map<string, { expiresAt: number; value: string | null }>();

function cacheKey(kind: "movie" | "tv", id: number) {
    return `${kind}:${id}`;
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
        logger.debug("[Jellyfin] Failed to parse JSON response", { path, error: String(err) });
        return null;
    }
}

export async function isAvailableByExternalIds(kind: "movie" | "tv", tmdbId?: number, tvdbId?: number): Promise<boolean | null> {
    const connection = await getJellyfinConnection();
    if (!connection) return null;
    const key = cacheKey(kind, (kind === "movie" ? tmdbId : tvdbId) || 0);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    let found = false;

    // Try ExternalId lookup first (preferred)
    if (typeof tmdbId === "number" && tmdbId > 0) {
        const byTmdb = await jellyfinFetch(`/Items/ByExternalId?ExternalId=tmdb:${tmdbId}`);
        if (Array.isArray(byTmdb?.Items) && byTmdb.Items.length > 0) {
            found = true;
        }
    }

    if (!found && typeof tvdbId === "number" && tvdbId > 0) {
        const byTvdb = await jellyfinFetch(`/Items/ByExternalId?ExternalId=tvdb:${tvdbId}`);
        if (Array.isArray(byTvdb?.Items) && byTvdb.Items.length > 0) {
            found = true;
        }
    }

    cache.set(key, { expiresAt: now + CACHE_TTL_MS, value: found });
    return found;
}

export async function isAvailableByTmdb(kind: "movie" | "tv", tmdbId: number): Promise<boolean | null> {
    const connection = await getJellyfinConnection();
    if (!connection) return null;
    const key = cacheKey(kind, tmdbId);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const byTmdb = await jellyfinFetch(`/Items/ByExternalId?ExternalId=tmdb:${tmdbId}`);
    const found = Array.isArray(byTmdb?.Items) && byTmdb.Items.length > 0;
    cache.set(key, { expiresAt: now + CACHE_TTL_MS, value: found });
    return found;
}

export async function getJellyfinItemIdByTmdb(kind: "movie" | "tv", tmdbId: number): Promise<string | null> {
    const connection = await getJellyfinConnection();
    if (!connection) return null;
    const key = `${cacheKey(kind, tmdbId)}:id`;
    const now = Date.now();
    const cached = itemIdCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const includeType = kind === "tv" ? "Series" : "Movie";
    const byTmdb = await jellyfinFetch(`/Items/ByExternalId?ExternalId=tmdb:${tmdbId}&IncludeItemTypes=${includeType}`);
    let itemId = "";
    if (Array.isArray(byTmdb?.Items) && byTmdb.Items.length > 0) {
        const match = byTmdb.Items.find((item: any) => String(item?.Type ?? "").toLowerCase() === includeType.toLowerCase());
        itemId = String((match ?? byTmdb.Items[0])?.Id ?? "");
    } else {
        const fallback = await jellyfinFetch(`/Items/ByExternalId?ExternalId=tmdb:${tmdbId}`);
        if (Array.isArray(fallback?.Items) && fallback.Items.length > 0) {
            const match = fallback.Items.find((item: any) => String(item?.Type ?? "").toLowerCase() === includeType.toLowerCase());
            itemId = String((match ?? fallback.Items[0])?.Id ?? "");
        }
    }
    itemIdCache.set(key, { expiresAt: now + CACHE_TTL_MS, value: itemId || null });
    return itemId || null;
}

export async function getJellyfinItemIdByTvdb(tvdbId: number): Promise<string | null> {
    const connection = await getJellyfinConnection();
    if (!connection) return null;
    const key = `tvdb:${tvdbId}:id`;
    const now = Date.now();
    const cached = itemIdCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const byTvdb = await jellyfinFetch(`/Items/ByExternalId?ExternalId=tvdb:${tvdbId}&IncludeItemTypes=Series`);
    let itemId = "";
    if (Array.isArray(byTvdb?.Items) && byTvdb.Items.length > 0) {
        const match = byTvdb.Items.find((item: any) => String(item?.Type ?? "").toLowerCase() === "series");
        itemId = String((match ?? byTvdb.Items[0])?.Id ?? "");
    } else {
        const fallback = await jellyfinFetch(`/Items/ByExternalId?ExternalId=tvdb:${tvdbId}`);
        if (Array.isArray(fallback?.Items) && fallback.Items.length > 0) {
            const match = fallback.Items.find((item: any) => String(item?.Type ?? "").toLowerCase() === "series");
            itemId = String((match ?? fallback.Items[0])?.Id ?? "");
        }
    }
    itemIdCache.set(key, { expiresAt: now + CACHE_TTL_MS, value: itemId || null });
    return itemId || null;
}

export async function getJellyfinItemIdByName(kind: "movie" | "tv", name: string): Promise<string | null> {
    const connection = await getJellyfinConnection();
    if (!connection) return null;
    const key = `name:${kind}:${name.toLowerCase()}`;
    const now = Date.now();
    const cached = itemIdCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const includeType = kind === "tv" ? "Series" : "Movie";
    const encodedName = encodeURIComponent(name);
    const searchResults = await jellyfinFetch(`/Items?searchTerm=${encodedName}&Recursive=true&IncludeItemTypes=${includeType}&Limit=10`);
    let itemId = "";
    if (Array.isArray(searchResults?.Items) && searchResults.Items.length > 0) {
        // Try exact match first
        const exactMatch = searchResults.Items.find((item: any) =>
            String(item?.Name ?? "").toLowerCase() === name.toLowerCase() &&
            String(item?.Type ?? "").toLowerCase() === includeType.toLowerCase()
        );
        if (exactMatch) {
            itemId = String(exactMatch.Id ?? "");
        } else {
            // Fall back to first matching type
            const typeMatch = searchResults.Items.find((item: any) =>
                String(item?.Type ?? "").toLowerCase() === includeType.toLowerCase()
            );
            if (typeMatch) {
                itemId = String(typeMatch.Id ?? "");
            }
        }
    }
    itemIdCache.set(key, { expiresAt: now + CACHE_TTL_MS, value: itemId || null });
    return itemId || null;
}

/**
 * Get Jellyfin item ID with multiple fallback strategies (like Jellyseerr)
 * For movies: tries TMDB, then name search
 * For TV: tries TMDB, then TVDB, then name search
 */
export async function getJellyfinItemId(
    kind: "movie" | "tv",
    tmdbId: number,
    title: string,
    tvdbId?: number | null
): Promise<string | null> {
    // Try TMDB first
    let itemId = await getJellyfinItemIdByTmdb(kind, tmdbId);
    if (itemId) return itemId;

    // For TV shows, try TVDB as well
    if (kind === "tv" && tvdbId) {
        itemId = await getJellyfinItemIdByTvdb(tvdbId);
        if (itemId) return itemId;
    }

    // Final fallback: search by name
    itemId = await getJellyfinItemIdByName(kind, title);
    return itemId;
}

async function getJellyfinConnection(): Promise<{ baseUrl: string; apiKey: string } | null> {
    const config = await getJellyfinConfig();
    if (!config.hostname || !config.apiKeyEncrypted) return null;
    const baseUrl = buildBaseUrl(config);
    if (!baseUrl) return null;
    try {
        const apiKey = decryptSecret(config.apiKeyEncrypted);
        return { baseUrl, apiKey };
    } catch (err) {
        logger.error("[Jellyfin] Failed to decrypt API key", err);
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

export type JellyfinItem = {
    Id: string;
    Name: string;
    OriginalTitle?: string;
    Type: "Movie" | "Series" | "Episode";
    ProviderIds: {
        Tmdb?: string;
        Tvdb?: string;
        Imdb?: string;
    };
};

export async function getJellyfinWatchlist(jellyfinUserId: string): Promise<JellyfinItem[]> {
    // Fetch favorites (treated as watchlist)
    // We request ProviderIds to map back to TMDB
    const res = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Filters=IsFavorite&Fields=ProviderIds,OriginalTitle&SortBy=DateCreated&SortOrder=Descending&Limit=200`
    );
    if (!res || !Array.isArray(res.Items)) {
        return [];
    }
    return res.Items as JellyfinItem[];
}
