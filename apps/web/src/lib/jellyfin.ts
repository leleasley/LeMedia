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

export async function isAvailableByExternalIds(
    kind: "movie" | "tv",
    tmdbId?: number,
    tvdbId?: number
): Promise<boolean | null> {
    const connection = await getJellyfinConnection();
    if (!connection) return null;
    const key = cacheKey(kind, (kind === "movie" ? tmdbId : tvdbId) || 0);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    let found = false;

    // Try ExternalId lookup first (preferred)
    // Only count items with real files; ignore series containers without media.
    const includeType = kind === "tv" ? "Episode" : "Movie";

    const hasItemWithFile = (items: any[]) =>
        items.some((item: any) => {
            const typeMatches =
                String(item?.Type ?? "").toLowerCase() === includeType.toLowerCase();
            return typeMatches && hasPhysicalFile(item);
        });

    if (typeof tmdbId === "number" && tmdbId > 0) {
        const byTmdb = await jellyfinFetch(
            `/Items?ExternalId=tmdb:${tmdbId}&IncludeItemTypes=${includeType}&Fields=LocationType,MediaSources,Path,IsVirtual,Type`
        );
        if (Array.isArray(byTmdb?.Items) && hasItemWithFile(byTmdb.Items)) {
            found = true;
        }
    }

    if (!found && typeof tvdbId === "number" && tvdbId > 0) {
        const byTvdb = await jellyfinFetch(
            `/Items?ExternalId=tvdb:${tvdbId}&IncludeItemTypes=${includeType}&Fields=LocationType,MediaSources,Path,IsVirtual,Type`
        );
        if (Array.isArray(byTvdb?.Items) && hasItemWithFile(byTvdb.Items)) {
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

    // For availability, require a real movie file or episode with a file. Ignore bare series containers.
    const includeType = kind === "tv" ? "Episode" : "Movie";
    const byTmdb = await jellyfinFetch(
        `/Items?ExternalId=tmdb:${tmdbId}&IncludeItemTypes=${includeType}&Fields=LocationType,MediaSources,Path,IsVirtual,Type`
    );
    const found =
        Array.isArray(byTmdb?.Items) &&
        byTmdb.Items.some((item: any) => {
            const typeMatches =
                String(item?.Type ?? "").toLowerCase() === includeType.toLowerCase();
            return typeMatches && hasPhysicalFile(item);
        });
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
    const byTmdb = await jellyfinFetch(`/Items?ExternalId=tmdb:${tmdbId}&IncludeItemTypes=${includeType}`);
    let itemId = "";
    if (Array.isArray(byTmdb?.Items) && byTmdb.Items.length > 0) {
        const match = byTmdb.Items.find((item: any) => String(item?.Type ?? "").toLowerCase() === includeType.toLowerCase());
        itemId = String((match ?? byTmdb.Items[0])?.Id ?? "");
    } else {
        const fallback = await jellyfinFetch(`/Items?ExternalId=tmdb:${tmdbId}`);
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

    const byTvdb = await jellyfinFetch(`/Items?ExternalId=tvdb:${tvdbId}&IncludeItemTypes=Series`);
    let itemId = "";
    if (Array.isArray(byTvdb?.Items) && byTvdb.Items.length > 0) {
        const match = byTvdb.Items.find((item: any) => String(item?.Type ?? "").toLowerCase() === "series");
        itemId = String((match ?? byTvdb.Items[0])?.Id ?? "");
    } else {
        const fallback = await jellyfinFetch(`/Items?ExternalId=tvdb:${tvdbId}`);
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
    tmdbId: number | undefined | null,
    title: string,
    tvdbId?: number | null
): Promise<string | null> {
    // Try TMDB first if provided
    if (tmdbId) {
        const byTmdb = await getJellyfinItemIdByTmdb(kind, tmdbId);
        if (byTmdb) return byTmdb;
    }

    // For TV shows, try TVDB as well
    if (kind === "tv" && tvdbId) {
        const byTvdb = await getJellyfinItemIdByTvdb(tvdbId);
        if (byTvdb) return byTvdb;
    }

    // Final fallback: search by name
    const byName = await getJellyfinItemIdByName(kind, title);
    return byName;
}

type EpisodeAvailabilityInput = {
    tmdbId?: number | null;
    tvdbId?: number | null;
    tmdbEpisodeId?: number | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    seriesTitle?: string;
    airDate?: string | null;
    tvdbEpisodeId?: number | null;
    seriesType?: string | null;
};

function hasPhysicalFile(item: any) {
    const locationType = String(item?.LocationType ?? "").toLowerCase();
    const itemType = String(item?.Type ?? "").toLowerCase();
    if (locationType === "virtual" || item?.IsVirtual === true) return false;
    // Do not treat series containers as available; we only care about actual media items.
    if (itemType === "series") return false;

    const mediaSources = Array.isArray(item?.MediaSources) ? item.MediaSources : [];
    const hasMediaSourcePath = mediaSources.some((source: any) => Boolean(source?.Path));
    const hasPath = Boolean(item?.Path);

    // Require a real path on either the item or one of its media sources.
    if (!hasMediaSourcePath && !hasPath) {
        return false;
    }

    return true;
}

export async function isEpisodeAvailable({
    tmdbId,
    tvdbId,
    tmdbEpisodeId,
    seasonNumber,
    episodeNumber,
    seriesTitle,
    airDate,
    tvdbEpisodeId,
    seriesType
}: EpisodeAvailabilityInput): Promise<{ available: boolean; itemId?: string | null }> {
    const isDaily = (seriesType ?? "").toLowerCase() === "daily";
    logger.debug("[Jellyfin] isEpisodeAvailable called", {
        seriesTitle,
        tmdbId,
        tvdbId,
        seasonNumber,
        episodeNumber,
        airDate,
        tvdbEpisodeId,
        tmdbEpisodeId,
        seriesType,
        isDaily
    });

    // Fast path: try direct episode lookup by TVDB episode id if provided
    if (tvdbEpisodeId) {
        logger.debug("[Jellyfin] Trying TVDB episode ID lookup", { tvdbEpisodeId, seriesTitle });
        const byEpisodeId = await jellyfinFetch(
            `/Items?ExternalId=tvdb:${tvdbEpisodeId}&IncludeItemTypes=Episode&Fields=ProviderIds,LocationType,MediaSources,Path,IsVirtual`
        );
        if (Array.isArray(byEpisodeId?.Items) && byEpisodeId.Items.length > 0) {
            logger.debug("[Jellyfin] Found episodes by TVDB ID", { count: byEpisodeId.Items.length, seriesTitle });
            const match = byEpisodeId.Items.find((ep: any) => {
                const providerMatches = Number(ep?.ProviderIds?.Tvdb ?? 0) === Number(tvdbEpisodeId);
                return providerMatches && hasPhysicalFile(ep);
            });
            if (match) {
                logger.info("[Jellyfin] Episode matched by TVDB ID", { seriesTitle, tvdbEpisodeId });
                return { available: true, itemId: String(match.Id) };
            }
        }
    }

    // Try TMDB episode id lookup when available (useful when Jellyfin is tagged with TMDB instead of TVDB)
    if (tmdbEpisodeId) {
        logger.debug("[Jellyfin] Trying TMDB episode ID lookup", { tmdbEpisodeId, seriesTitle });
        const byTmdbEpisodeId = await jellyfinFetch(
            `/Items?ExternalId=tmdb:${tmdbEpisodeId}&IncludeItemTypes=Episode&Fields=ProviderIds,LocationType,MediaSources,Path,IsVirtual`
        );
        if (Array.isArray(byTmdbEpisodeId?.Items) && byTmdbEpisodeId.Items.length > 0) {
            logger.debug("[Jellyfin] Found episodes by TMDB ID", { count: byTmdbEpisodeId.Items.length, seriesTitle });
            const match = byTmdbEpisodeId.Items.find((ep: any) => {
                const providerMatches = Number(ep?.ProviderIds?.Tmdb ?? 0) === Number(tmdbEpisodeId);
                return providerMatches && hasPhysicalFile(ep);
            });
            if (match) {
                logger.info("[Jellyfin] Episode matched by TMDB ID", { seriesTitle, tmdbEpisodeId });
                return { available: true, itemId: String(match.Id) };
            }
        }
    }

    // Helper to test provider id matches inside a list of episodes
    const matchByProviderId = (items: any[], providerId: number | null | undefined, key: "Tmdb" | "Tvdb") => {
        if (!providerId) return null;
        const match = items.find((ep: any) => {
            const providerValue = ep?.ProviderIds?.[key];
            return providerValue && Number(providerValue) === Number(providerId) && hasPhysicalFile(ep);
        });
        return match ?? null;
    };

    const seriesId = await getJellyfinItemId("tv", tmdbId, seriesTitle || "", tvdbId ?? undefined);
    if (!seriesId) {
        logger.debug("[Jellyfin] No series ID found", { tmdbId, tvdbId, seriesTitle });
        return { available: false };
    }

    logger.debug("[Jellyfin] Checking episode availability", {
        seriesId,
        seriesTitle,
        tmdbId,
        tvdbId,
        seasonNumber,
        episodeNumber,
        airDate,
        seriesType
    });

    // Don't filter by season in the API call - Jellyfin and Sonarr often use different season numbering
    // especially for daily series like WWE. Instead, fetch all episodes and filter in-memory.
    // Use a large limit to ensure we get all episodes (some series like WWE Raw have 500+ episodes)
    const episodes = await jellyfinFetch(
        `/Shows/${seriesId}/Episodes?Fields=ProviderIds,IndexNumber,ParentIndexNumber,PremiereDate,DateCreated,Name,OriginalTitle,LocationType,MediaSources,Path,IsVirtual&Limit=4000`
    );

    let items: any[] = Array.isArray(episodes?.Items) ? episodes.Items : [];
    // Drop metadata-only episodes that don't have an attached file
    items = items.filter((ep) => hasPhysicalFile(ep));

    // Try matching by provider id on fetched items (extra safety if external-id lookup missed)
    const providerTvdbMatch = matchByProviderId(items, tvdbEpisodeId, "Tvdb");
    if (providerTvdbMatch?.Id) {
        return { available: true, itemId: String(providerTvdbMatch.Id) };
    }
    // Validate season and episode numbers - treat 0 as invalid
    const hasValidSeasonNumber = seasonNumber !== undefined && seasonNumber !== null && seasonNumber > 0;
    const hasValidEpisodeNumber = episodeNumber !== undefined && episodeNumber !== null && episodeNumber > 0;
    const allowAirDateOnly = !hasValidSeasonNumber || !hasValidEpisodeNumber;

    logger.debug("[Jellyfin] Episode validation", {
        seriesTitle,
        seasonNumber,
        episodeNumber,
        hasValidSeasonNumber,
        hasValidEpisodeNumber,
        allowAirDateOnly,
        itemsCount: items.length,
    });

    // For daily series, skip season filtering entirely. Otherwise, narrow by season when available.
    let seasonFilteredItems = items;
    if (!isDaily && hasValidSeasonNumber) {
        // Use Number() coercion for consistent type comparison - Jellyfin may return string or number
        seasonFilteredItems = items.filter((ep: any) =>
            Number(ep?.ParentIndexNumber) === Number(seasonNumber)
        );
        // If we got results with season filter, use those. Otherwise fall back to all episodes.
        if (seasonFilteredItems.length > 0) {
            items = seasonFilteredItems;
        }
    }

    logger.debug("[Jellyfin] Episodes after season filtering", {
        seriesTitle,
        seasonNumber,
        episodeCount: items.length,
        episodes: items.map((ep: any) => ({
            indexNumber: ep?.IndexNumber,
            parentIndexNumber: ep?.ParentIndexNumber,
            premiereDate: ep?.PremiereDate,
            tmdb: ep?.ProviderIds?.Tmdb,
            tvdb: ep?.ProviderIds?.Tvdb
        }))
    });

    const matchByNumber = allowAirDateOnly
        ? null
        : items.find((ep: any) => {
              const indexMatch = Number(ep?.IndexNumber ?? -1) === Number(episodeNumber);
              const seasonMatch =
                  ep?.ParentIndexNumber === undefined ||
                  ep?.ParentIndexNumber === null ||
                  Number(ep.ParentIndexNumber) === Number(seasonNumber);

              logger.debug("[Jellyfin] Checking episode match by number", {
                  seriesTitle,
                  episodeNumber,
                  epIndexNumber: ep?.IndexNumber,
                  indexMatch,
                  seasonMatch,
                  epSeasonNumber: ep?.ParentIndexNumber,
                  expectedSeasonNumber: seasonNumber
              });

              // Match requires both index and season to match
              return seasonMatch && indexMatch;
          });

    if (matchByNumber?.Id && hasPhysicalFile(matchByNumber)) {
        logger.debug("[Jellyfin] Episode matched by number", {
            seriesTitle,
            episodeNumber,
            matchedEpisode: matchByNumber.IndexNumber
        });
        return { available: true, itemId: String(matchByNumber.Id) };
    }

    if (airDate) {
        const normalizedAirDate = airDate.split("T")[0];
        logger.debug("[Jellyfin] Trying to match by air date", {
            seriesTitle,
            normalizedAirDate,
            episodeCount: items.length
        });

        const matchByDate = items.find((ep: any) => {
            const premiereDate = String(ep?.PremiereDate || "").split("T")[0];
            if (!premiereDate) {
                logger.debug("[Jellyfin] Episode has no premiere date", {
                    seriesTitle,
                    episodeIndex: ep?.IndexNumber
                });
                return false;
            }

            const sameDay = premiereDate === normalizedAirDate;
            if (sameDay) {
                logger.debug("[Jellyfin] Exact date match found", {
                    seriesTitle,
                    episodeIndex: ep?.IndexNumber,
                    premiereDate,
                    airDate: normalizedAirDate
                });
                return true;
            }

            // Allow slack for timezone/date metadata drift
            const air = new Date(normalizedAirDate);
            const prem = new Date(premiereDate);
            const diffDays = Math.abs(
                Math.round((prem.getTime() - air.getTime()) / (24 * 60 * 60 * 1000))
            );

            logger.debug("[Jellyfin] Checking date proximity", {
                seriesTitle,
                episodeIndex: ep?.IndexNumber,
                premiereDate,
                airDate: normalizedAirDate,
                diffDays
            });

            const seasonMatches = isDaily || seasonNumber === undefined || seasonNumber === null || ep?.ParentIndexNumber === undefined || ep?.ParentIndexNumber === null
                ? true
                : Number(ep.ParentIndexNumber) === Number(seasonNumber);

            const allowedDrift = isDaily ? 3 : 2;
            return seasonMatches && diffDays <= allowedDrift;
        });
        if (matchByDate?.Id && hasPhysicalFile(matchByDate)) {
            logger.debug("[Jellyfin] Episode matched by air date", {
                seriesTitle,
                episodeNumber: matchByDate.IndexNumber,
                premiereDate: matchByDate.PremiereDate,
                airDate
            });
            return { available: true, itemId: String(matchByDate.Id) };
        }
    }

    // Final fallback: if we have an air date, check DateCreated proximity (in case PremiereDate is missing)
    if (airDate) {
        const normalizedAirDate = airDate.split("T")[0];
        const air = new Date(normalizedAirDate);
        const matchByCreated = items.find((ep: any) => {
            const created = ep?.DateCreated ? new Date(ep.DateCreated) : null;
            if (!created) return false;
            const diffDays = Math.abs(
                Math.round((created.getTime() - air.getTime()) / (24 * 60 * 60 * 1000))
            );
            const seasonMatches = isDaily || seasonNumber === undefined || seasonNumber === null || ep?.ParentIndexNumber === undefined || ep?.ParentIndexNumber === null
                ? true
                : Number(ep.ParentIndexNumber) === Number(seasonNumber);
            const allowedDrift = isDaily ? 10 : 2;
            return seasonMatches && diffDays <= allowedDrift;
        });
        if (matchByCreated?.Id && hasPhysicalFile(matchByCreated)) {
            logger.debug("[Jellyfin] Episode matched by created date", {
                seriesTitle,
                episodeNumber: matchByCreated.IndexNumber,
                createdDate: matchByCreated.DateCreated,
                airDate
            });
            return { available: true, itemId: String(matchByCreated.Id) };
        }
    }

    // No match found

    logger.debug("[Jellyfin] Episode not found in Jellyfin", {
        seriesTitle,
        seasonNumber,
        episodeNumber,
        airDate
    });

    return { available: false };
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

export async function findAvailableMovieByTmdb(
    title: string,
    tmdbId: number
): Promise<{ available: boolean; itemId?: string | null }> {
    const encoded = encodeURIComponent(title);
    const res = await jellyfinFetch(
        `/Items?searchTerm=${encoded}&Recursive=true&IncludeItemTypes=Movie&Fields=ProviderIds,LocationType,MediaSources,Path,IsVirtual,Type&Limit=20`
    );
    const items: any[] = Array.isArray(res?.Items) ? res.Items : [];
    const matched = items.find((item: any) => {
        const typeMatches = String(item?.Type ?? "").toLowerCase() === "movie";
        const providerMatches = Number(item?.ProviderIds?.Tmdb ?? 0) === Number(tmdbId);
        return typeMatches && providerMatches && hasPhysicalFile(item);
    });

    if (!matched) return { available: false };
    return { available: true, itemId: String(matched?.Id ?? "") || null };
}

export async function findAvailableSeriesByIds(
    title: string,
    tmdbId?: number,
    tvdbId?: number
): Promise<{ available: boolean; itemId?: string | null }> {
    const encoded = encodeURIComponent(title);
    const res = await jellyfinFetch(
        `/Items?searchTerm=${encoded}&Recursive=true&IncludeItemTypes=Series&Fields=ProviderIds,Type&Limit=10`
    );
    const items: any[] = Array.isArray(res?.Items) ? res.Items : [];
    const seriesMatch = items.find((item: any) => {
        const typeMatches = String(item?.Type ?? "").toLowerCase() === "series";
        const tmdbMatches = tmdbId ? Number(item?.ProviderIds?.Tmdb ?? 0) === Number(tmdbId) : false;
        const tvdbMatches = tvdbId ? Number(item?.ProviderIds?.Tvdb ?? 0) === Number(tvdbId) : false;
        return typeMatches && (tmdbMatches || tvdbMatches);
    });

    if (!seriesMatch?.Id) return { available: false };

    const episodes = await jellyfinFetch(
        `/Shows/${seriesMatch.Id}/Episodes?Fields=LocationType,MediaSources,Path,IsVirtual,Type&Limit=5`
    );
    const epItems: any[] = Array.isArray(episodes?.Items) ? episodes.Items : [];
    const hasFile = epItems.some((ep) => hasPhysicalFile(ep));

    if (!hasFile) return { available: false };
    return { available: true, itemId: String(seriesMatch.Id) };
}

// Movie fallback: search by name and verify physical file exists
export async function findAvailableMovieByName(title: string): Promise<{ available: boolean; itemId?: string | null }> {
    const encoded = encodeURIComponent(title);
    const res = await jellyfinFetch(
        `/Items?searchTerm=${encoded}&Recursive=true&IncludeItemTypes=Movie&Fields=ProviderIds,LocationType,MediaSources,Path,IsVirtual,Type&Limit=20`
    );
    const items: any[] = Array.isArray(res?.Items) ? res.Items : [];
    // Only consider actual Movies with physical files AND exact name match
    const exactMatch = items.find((item: any) => {
        const typeMatches = String(item?.Type ?? '').toLowerCase() === 'movie';
        const nameMatches = String(item?.Name ?? '').toLowerCase() === title.toLowerCase();
        return typeMatches && nameMatches && hasPhysicalFile(item);
    });
    
    if (!exactMatch) return { available: false };
    return { available: true, itemId: String(exactMatch?.Id ?? '') || null };
}
