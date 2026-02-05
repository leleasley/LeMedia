import "server-only";
import { decryptSecret } from "@/lib/encryption";
import { getJellyfinConfig } from "@/db";
import { logger } from "@/lib/logger";
import { validateExternalServiceUrl } from "@/lib/url-validation";

type JellyfinConnection = { baseUrl: string; apiKey: string };
let connectionCache: { expiresAt: number; value: JellyfinConnection } | null = null;
const CONNECTION_CACHE_TTL_MS = 5 * 60 * 1000;

async function getJellyfinConnection(): Promise<JellyfinConnection | null> {
    const now = Date.now();
    if (connectionCache && connectionCache.expiresAt > now) {
        return connectionCache.value;
    }

    const config = await getJellyfinConfig();
    if (!config.hostname || !config.apiKeyEncrypted) return null;
    const baseUrl = buildBaseUrl(config);
    if (!baseUrl) return null;

    try {
        const allowHttp = process.env.JELLYFIN_ALLOW_HTTP === "true";
        const allowPrivateIPs = process.env.JELLYFIN_ALLOW_PRIVATE_IPS === "true";
        const allowedCidrs = process.env.JELLYFIN_ALLOWED_CIDRS?.split(",").map(part => part.trim()).filter(Boolean);
        validateExternalServiceUrl(baseUrl, "Jellyfin", {
            allowHttp,
            allowPrivateIPs,
            allowedCidrs,
            requireHttps: !allowHttp && process.env.NODE_ENV === "production"
        });
    } catch (err) {
        logger.error("[Jellyfin] URL validation failed", err);
        return null;
    }

    try {
        const apiKey = decryptSecret(config.apiKeyEncrypted);
        const connection = { baseUrl, apiKey };
        connectionCache = { expiresAt: now + CONNECTION_CACHE_TTL_MS, value: connection };
        return connection;
    } catch (err) {
        logger.error("[Jellyfin] Failed to decrypt API key", err);
        return null;
    }
}

function buildBaseUrl(config: { hostname: string; port: number; useSsl: boolean; urlBase: string }) {
    const host = config.hostname.trim();
    if (!host) return "";
    if (host.includes('://')) {
        logger.error("[Jellyfin] Invalid hostname - contains protocol", { hostname: host });
        return "";
    }
    const basePath = config.urlBase.trim();
    const normalizedPath = basePath ? basePath.startsWith("/") ? basePath : `/${basePath}` : "";
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

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok && (res.status === 429 || res.status === 503)) {
            const delayMs = 500 * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
        }
        break;
    }

    if (!res || !res.ok) return null;
    try {
        return await res.json();
    } catch (err) {
        logger.debug("[Jellyfin] Failed to parse JSON response", { path, error: String(err) });
        return null;
    }
}

type JellyfinItem = {
    Id: string;
    Name: string;
    Type: string;
    ProductionYear?: number;
    PremiereDate?: string;
    ProviderIds?: {
        Tmdb?: string;
        Tvdb?: string;
        Imdb?: string;
    };
    UserData?: {
        PlayedPercentage?: number;
        PlaybackPositionTicks?: number;
        Played?: boolean;
        LastPlayedDate?: string;
        PlayCount?: number;
    };
    ImageTags?: {
        Primary?: string;
        Backdrop?: string;
    };
    BackdropImageTags?: string[];
    SeriesName?: string;
    SeriesId?: string;
    SeasonName?: string;
    IndexNumber?: number;
    ParentIndexNumber?: number;
    RunTimeTicks?: number;
};

/**
 * Get items the user is currently watching (continue watching)
 */
export async function getContinueWatching(jellyfinUserId: string): Promise<JellyfinItem[]> {
    const res = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items/Resume?Limit=12&Fields=ProviderIds,UserData,PrimaryImageAspectRatio,BasicSyncInfo&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Banner,Thumb&EnableTotalRecordCount=false&MediaTypes=Video`
    );
    if (!res || !Array.isArray(res.Items)) {
        return [];
    }
    return res.Items as JellyfinItem[];
}

/**
 * Get recently watched items with full details for timeline
 */
export async function getRecentlyWatchedWithDetails(userId: string, limit = 30): Promise<Array<{
    id: string;
    name: string;
    type: string;
    seriesName?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    year?: number;
    lastPlayed: string;
    tmdbId: number | null;
}>> {
    try {
        const data = await jellyfinFetch(
            `/Users/${userId}/Items?` +
                "SortBy=DatePlayed&" +
                "SortOrder=Descending&" +
                "IncludeItemTypes=Movie,Episode&" +
                "Recursive=true&" +
                "Fields=ProviderIds,UserData,ProductionYear,SeriesName,SeasonNumber,IndexNumber&" +
                "Filters=IsPlayed&" +
                `Limit=${limit}`
        );

        if (!data?.Items?.length) {
            return [];
        }

        return data.Items.map((item: JellyfinItem) => ({
            id: item.Id,
            name: item.Name,
            type: item.Type,
            seriesName: item.SeriesName,
            seasonNumber: item.ParentIndexNumber,
            episodeNumber: item.IndexNumber,
            year: item.ProductionYear,
            lastPlayed: item.UserData?.LastPlayedDate ?? new Date().toISOString(),
            tmdbId: item.ProviderIds?.Tmdb ? parseInt(item.ProviderIds.Tmdb, 10) : null
        }));
    } catch (error) {
        console.error("[getRecentlyWatchedWithDetails] Error:", error);
        return [];
    }
}

/**
 * Get stats for this month and last month
 */
export async function getThisMonthStats(userId: string): Promise<{
    moviesThisMonth: number;
    episodesThisMonth: number;
    hoursThisMonth: number;
    moviesLastMonth: number;
    episodesLastMonth: number;
    hoursLastMonth: number;
}> {
    try {
        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

        // Get this month's data
        const thisMonthData = await jellyfinFetch(
            `/Users/${userId}/Items?` +
                "IncludeItemTypes=Movie,Episode&" +
                "Recursive=true&" +
                "Fields=RunTimeTicks,UserData&" +
                "Filters=IsPlayed&" +
                "Limit=1000&" +
                `MinDateLastSaved=${thisMonthStart}`
        );

        // Get last month's data
        const lastMonthData = await jellyfinFetch(
            `/Users/${userId}/Items?` +
                "IncludeItemTypes=Movie,Episode&" +
                "Recursive=true&" +
                "Fields=RunTimeTicks,UserData&" +
                "Filters=IsPlayed&" +
                "Limit=1000&" +
                `MinDateLastSaved=${lastMonthStart}&` +
                `MaxDateLastSaved=${lastMonthEnd}`
        );

        const calculateStats = (items: JellyfinItem[]) => {
            let movies = 0, episodes = 0, ticks = 0;
            
            for (const item of items) {
                if (item.Type === "Movie") {
                    movies++;
                    ticks += item.RunTimeTicks || 0;
                } else if (item.Type === "Episode") {
                    episodes++;
                    ticks += item.RunTimeTicks || 0;
                }
            }
            
            const hours = Math.round(ticks / 10000000 / 3600);
            return { movies, episodes, hours };
        };

        const thisMonth = calculateStats(thisMonthData?.Items || []);
        const lastMonth = calculateStats(lastMonthData?.Items || []);

        return {
            moviesThisMonth: thisMonth.movies,
            episodesThisMonth: thisMonth.episodes,
            hoursThisMonth: thisMonth.hours,
            moviesLastMonth: lastMonth.movies,
            episodesLastMonth: lastMonth.episodes,
            hoursLastMonth: lastMonth.hours
        };
    } catch (error) {
        console.error("[getThisMonthStats] Error:", error);
        return {
            moviesThisMonth: 0,
            episodesThisMonth: 0,
            hoursThisMonth: 0,
            moviesLastMonth: 0,
            episodesLastMonth: 0,
            hoursLastMonth: 0
        };
    }
}

/**
 * Calculate achievement level based on hours watched this week
 */
export async function getAchievementLevel(userId: string): Promise<{
    hoursThisWeek: number;
    level: "casual" | "watcher" | "binge" | "marathon" | "legendary";
    nextMilestone: number;
    progress: number;
}> {
    try {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const data = await jellyfinFetch(
            `/Users/${userId}/Items?` +
                "IncludeItemTypes=Movie,Episode&" +
                "Recursive=true&" +
                "Fields=RunTimeTicks,UserData&" +
                "Filters=IsPlayed&" +
                "Limit=1000&" +
                `MinDateLastSaved=${sevenDaysAgo}`
        );

        let totalTicks = 0;
        for (const item of data?.Items || []) {
            totalTicks += item.RunTimeTicks || 0;
        }

        const hoursThisWeek = Math.round(totalTicks / 10000000 / 3600);

        // Achievement tiers
        let level: "casual" | "watcher" | "binge" | "marathon" | "legendary" = "casual";
        let nextMilestone = 5;
        let progress = hoursThisWeek;

        if (hoursThisWeek >= 100) {
            level = "legendary";
            nextMilestone = 100;
            progress = 100;
        } else if (hoursThisWeek >= 50) {
            level = "marathon";
            nextMilestone = 100;
            progress = hoursThisWeek;
        } else if (hoursThisWeek >= 25) {
            level = "binge";
            nextMilestone = 50;
            progress = hoursThisWeek;
        } else if (hoursThisWeek >= 10) {
            level = "watcher";
            nextMilestone = 25;
            progress = hoursThisWeek;
        } else {
            level = "casual";
            nextMilestone = 10;
            progress = hoursThisWeek;
        }

        return {
            hoursThisWeek,
            level,
            nextMilestone,
            progress: Math.min(progress, nextMilestone)
        };
    } catch (error) {
        console.error("[getAchievementLevel] Error:", error);
        return {
            hoursThisWeek: 0,
            level: "casual",
            nextMilestone: 10,
            progress: 0
        };
    }
}


/**
 * Get user's watch statistics
 */
export async function getWatchStats(jellyfinUserId: string): Promise<{
    totalMoviesWatched: number;
    totalEpisodesWatched: number;
    totalSeriesWatched: number;
    totalHoursWatched: number;
    totalDaysWatched: number;
    moviesThisWeek: number;
    episodesThisWeek: number;
    favoriteGenres: { name: string; count: number }[];
}> {
    // Get all watched movies
    const moviesRes = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?IncludeItemTypes=Movie&Filters=IsPlayed&Fields=Genres,RunTimeTicks,UserData&Recursive=true&EnableTotalRecordCount=true&Limit=1`
    );
    const totalMoviesWatched = moviesRes?.TotalRecordCount ?? 0;

    // Get all watched episodes
    const episodesRes = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?IncludeItemTypes=Episode&Filters=IsPlayed&Fields=Genres,RunTimeTicks,UserData,SeriesId&Recursive=true&EnableTotalRecordCount=true&Limit=1`
    );
    const totalEpisodesWatched = episodesRes?.TotalRecordCount ?? 0;

    // Get unique series watched by fetching episodes with SeriesId
    const episodesForSeriesCount = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?IncludeItemTypes=Episode&Filters=IsPlayed&Fields=SeriesId&Recursive=true&Limit=2000`
    );
    const episodesList: Array<{ SeriesId?: string }> = Array.isArray(episodesForSeriesCount?.Items) ? episodesForSeriesCount.Items : [];
    const uniqueSeriesIds = new Set(episodesList.map(ep => ep.SeriesId).filter(Boolean));
    const totalSeriesWatched = uniqueSeriesIds.size;

    // Get recently watched for time calculations and weekly counts
    const recentRes = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?SortBy=DatePlayed&SortOrder=Descending&IncludeItemTypes=Movie,Episode&Filters=IsPlayed&Limit=500&Fields=Genres,RunTimeTicks,UserData,DateCreated&Recursive=true`
    );
    
    const recentItems: JellyfinItem[] = Array.isArray(recentRes?.Items) ? recentRes.Items : [];
    
    // Calculate total watch time
    let totalTicks = 0;
    const genreCounts: Record<string, number> = {};
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let moviesThisWeek = 0;
    let episodesThisWeek = 0;

    for (const item of recentItems) {
        const runTimeTicks = item.RunTimeTicks ?? 0;
        totalTicks += runTimeTicks;

        // Count genres
        if (item.Type === "Movie") {
            // For movies, we can get genres directly from the API with more data
        }

        // Count items this week
        const lastPlayed = item.UserData?.LastPlayedDate;
        if (lastPlayed && new Date(lastPlayed) >= oneWeekAgo) {
            if (item.Type === "Movie") moviesThisWeek++;
            if (item.Type === "Episode") episodesThisWeek++;
        }
    }

    // Get genre data more accurately by fetching movies with genre info
    const moviesWithGenresRes = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?IncludeItemTypes=Movie&Filters=IsPlayed&Fields=Genres&Recursive=true&Limit=500`
    );
    const moviesWithGenres: Array<{ Genres?: Array<string> | Array<{ Name: string }> }> = Array.isArray(moviesWithGenresRes?.Items) ? moviesWithGenresRes.Items : [];
    
    for (const movie of moviesWithGenres) {
        if (Array.isArray(movie.Genres)) {
            for (const genre of movie.Genres) {
                // Handle both string array and object array formats
                const name = typeof genre === 'string' ? genre : (genre?.Name || String(genre));
                if (name) {
                    genreCounts[name] = (genreCounts[name] || 0) + 1;
                }
            }
        }
    }

    const episodesWithGenresRes = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?IncludeItemTypes=Episode&Filters=IsPlayed&Fields=Genres&Recursive=true&Limit=500`
    );
    const episodesWithGenres: Array<{ Genres?: Array<string> | Array<{ Name: string }> }> = Array.isArray(episodesWithGenresRes?.Items) ? episodesWithGenresRes.Items : [];
    
    for (const episode of episodesWithGenres) {
        if (Array.isArray(episode.Genres)) {
            for (const genre of episode.Genres) {
                // Handle both string array and object array formats
                const name = typeof genre === 'string' ? genre : (genre?.Name || String(genre));
                if (name) {
                    genreCounts[name] = (genreCounts[name] || 0) + 1;
                }
            }
        }
    }

    // Sort genres by count
    const favoriteGenres = Object.entries(genreCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Convert ticks to hours (10,000,000 ticks = 1 second)
    const totalSeconds = totalTicks / 10000000;
    const totalHours = Math.round(totalSeconds / 3600);
    const totalDays = Math.round(totalHours / 24);

    return {
        totalMoviesWatched,
        totalEpisodesWatched,
        totalSeriesWatched,
        totalHoursWatched: totalHours,
        totalDaysWatched: totalDays,
        moviesThisWeek,
        episodesThisWeek,
        favoriteGenres
    };
}

/**
 * Get detailed movie watch history with dates
 */
export async function getMovieWatchHistory(jellyfinUserId: string): Promise<Array<{
    id: string;
    name: string;
    tmdbId: number | null;
    year: number | null;
    lastPlayed: string;
    playCount: number;
}>> {
    const res = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?IncludeItemTypes=Movie&Filters=IsPlayed&SortBy=DatePlayed&SortOrder=Descending&Fields=ProviderIds,UserData,ProductionYear&Recursive=true&Limit=100`
    );
    
    if (!res || !Array.isArray(res.Items)) {
        return [];
    }
    
    return res.Items.map((item: JellyfinItem) => ({
        id: item.Id,
        name: item.Name,
        tmdbId: item.ProviderIds?.Tmdb ? parseInt(item.ProviderIds.Tmdb, 10) : null,
        year: item.ProductionYear ?? null,
        lastPlayed: item.UserData?.LastPlayedDate ?? '',
        playCount: item.UserData?.PlayCount ?? 1
    }));
}

/**
 * Get detailed series watch history with dates
 */
export async function getSeriesWatchHistory(jellyfinUserId: string): Promise<Array<{
    id: string;
    name: string;
    tmdbId: number | null;
    year: number | null;
    lastPlayed: string;
    episodesWatched: number;
}>> {
    // Get all watched episodes to find series
    const episodesRes = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Items?IncludeItemTypes=Episode&Filters=IsPlayed&Fields=SeriesId,SeriesName,ProviderIds,UserData&Recursive=true&Limit=2000`
    );
    
    if (!episodesRes || !Array.isArray(episodesRes.Items)) {
        return [];
    }
    
    // Group episodes by series
    const seriesMap = new Map<string, {
        id: string;
        name: string;
        tmdbId: number | null;
        year: number | null;
        lastPlayed: string;
        episodesWatched: number;
    }>();
    
    for (const episode of episodesRes.Items) {
        const seriesId = episode.SeriesId;
        if (!seriesId) continue;
        
        const lastPlayed = episode.UserData?.LastPlayedDate ?? '';
        
        if (seriesMap.has(seriesId)) {
            const existing = seriesMap.get(seriesId)!;
            existing.episodesWatched++;
            // Keep the most recent play date
            if (lastPlayed > existing.lastPlayed) {
                existing.lastPlayed = lastPlayed;
            }
        } else {
            // Get series info
            const seriesInfo = await jellyfinFetch(
                `/Users/${jellyfinUserId}/Items/${seriesId}?Fields=ProviderIds,ProductionYear`
            );
            
            seriesMap.set(seriesId, {
                id: seriesId,
                name: episode.SeriesName || 'Unknown Series',
                tmdbId: seriesInfo?.ProviderIds?.Tmdb ? parseInt(seriesInfo.ProviderIds.Tmdb, 10) : null,
                year: seriesInfo?.ProductionYear ?? null,
                lastPlayed,
                episodesWatched: 1
            });
        }
    }
    
    // Convert to array and sort by last played
    return Array.from(seriesMap.values())
        .sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed));
}

/**
 * Get recommendations based on user's watch history
 */
export async function getPersonalizedRecommendations(jellyfinUserId: string, limit = 12): Promise<JellyfinItem[]> {
    // Get suggestions from Jellyfin's recommendation engine
    const res = await jellyfinFetch(
        `/Users/${jellyfinUserId}/Suggestions?Limit=${limit}&Fields=ProviderIds,PrimaryImageAspectRatio,BasicSyncInfo&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb`
    );
    
    if (!res || !Array.isArray(res.Items)) {
        return [];
    }
    
    return res.Items as JellyfinItem[];
}
