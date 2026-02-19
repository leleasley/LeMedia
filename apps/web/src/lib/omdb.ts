import "server-only";
import { getCached, setCached } from "@/lib/local-cache";
import { deduplicateFetch } from "@/lib/request-cache";
import { logger } from "@/lib/logger";

/**
 * Radarr's public IMDb proxy API - same as Jellyseerr uses.
 * Free, no API keys, no rate limits, returns IMDb + Metacritic ratings.
 */
const RADARR_IMDB_PROXY = "https://api.radarr.video/v1";

type OmdbResponse = {
    imdbRating?: string;
    imdbVotes?: string;
    Metascore?: string;
    Response: string;
    Error?: string;
};

interface RadarrProxyMovie {
    TmdbId: number;
    ImdbId: string;
    Title: string;
    MovieRatings: {
        Tmdb: { Count: number; Value: number; Type: string };
        Imdb: { Count: number; Value: number; Type: string };
        Metacritic: { Count: number; Value: number; Type: string };
        RottenTomatoes?: { Count: number; Value: number; Type: string };
    };
}

/**
 * Fetch IMDb rating and Metacritic score using Radarr's public proxy.
 * This is the same approach Jellyseerr uses - no API keys, no rate limits.
 */
export async function getOmdbData(imdbId: string): Promise<OmdbResponse | null> {
    if (!imdbId || !imdbId.startsWith("tt")) {
        return null;
    }

    const cacheKey = `radarr-imdb:${imdbId}`;

    // Use deduplication to prevent concurrent duplicate requests
    return deduplicateFetch(
        cacheKey,
        async () => {
            const cached = getCached<OmdbResponse | null>(cacheKey);
            if (cached !== undefined) {
                return cached;
            }

            try {
                const url = `${RADARR_IMDB_PROXY}/movie/imdb/${imdbId}`;
                const res = await fetch(url, {
                    next: { revalidate: 86400 } // Cache for 24 hours
                });

                if (!res.ok) {
                    logger.debug("Radarr IMDb proxy error", { status: res.status });
                    return null;
                }

                const data: RadarrProxyMovie[] = await res.json();

                if (!data || !Array.isArray(data) || data.length === 0) {
                    logger.error("Radarr proxy: No data returned");
                    return null;
                }

                const movie = data[0];
                const ratings = movie.MovieRatings;

                // Convert to OMDb format for compatibility
                const result: OmdbResponse = {
                    Response: "True",
                    imdbRating: ratings.Imdb?.Value ? String(ratings.Imdb.Value) : undefined,
                    imdbVotes: ratings.Imdb?.Count ? String(ratings.Imdb.Count) : undefined,
                    Metascore: ratings.Metacritic?.Value ? String(ratings.Metacritic.Value) : undefined,
                };

                setCached(cacheKey, result, 24 * 60 * 60 * 1000); // 24 hour cache
                return result;
            } catch (error) {
                logger.error("Radarr IMDb proxy error", error);
                return null;
            }
        },
        { ttl: 24 * 60 * 60 * 1000 } // 24 hours - ratings change infrequently
    );
}
