/**
 * Request deduplication cache - prevents concurrent duplicate API calls
 * If multiple requests for same URL come in while one is pending, reuse the result
 * Huge performance boost for slow endpoints (RT, OMDB, Radarr, Sonarr)
 */

type PendingRequest<T> = {
    promise: Promise<T>;
    timestamp: number;
};

type CacheEntry = {
    data: any;
    timestamp: number;
    hits: number;
    misses: number;
    ttl: number;
};

// In-memory cache of pending requests
const pendingRequests = new Map<string, PendingRequest<any>>();

// Cache results for a short time (5 seconds) to catch immediate duplicates
const resultCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5000; // 5 seconds
const SWEEP_INTERVAL_MS = 60 * 1000;
let lastSweep = 0;

// Track overall cache statistics
let globalStats = {
    total_requests: 0,
    cache_hits: 0,
    cache_misses: 0,
};

function sweepResultCache(now = Date.now()) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    for (const [key, entry] of resultCache.entries()) {
        const ttl = entry.ttl || CACHE_TTL;
        if (now - entry.timestamp > ttl) {
            resultCache.delete(key);
        }
    }
}

/**
 * Deduplicate fetch requests - if same request is in-flight, return existing promise
 * @param key - Unique cache key
 * @param fetcher - Async function to call if not cached
 * @param options - ttl: cache duration in ms, skipCache: bypass caching
 */
export async function deduplicateFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: { ttl?: number; skipCache?: boolean }
): Promise<T> {
    const cacheKey = key;
    globalStats.total_requests++;
    sweepResultCache();

    // Check if we have a cached result that's still fresh
    if (!options?.skipCache) {
        const cached = resultCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < (options?.ttl ?? CACHE_TTL)) {
            cached.hits++;
            globalStats.cache_hits++;
            return cached.data;
        }
    }

    globalStats.cache_misses++;

    // Check if request is already in-flight
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
        return pending.promise;
    }

    // Create new request and track it
    const promise = fetcher()
        .then((result) => {
            // Cache the result
            const existing = resultCache.get(cacheKey);
            if (existing) {
                existing.data = result;
                existing.timestamp = Date.now();
                existing.ttl = options?.ttl ?? existing.ttl ?? CACHE_TTL;
            } else {
                resultCache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now(),
                    hits: 0,
                    misses: 1,
                    ttl: options?.ttl ?? CACHE_TTL,
                });
            }
            // Remove from pending
            pendingRequests.delete(cacheKey);
            return result;
        })
        .catch((error) => {
            // Remove from pending on error
            pendingRequests.delete(cacheKey);
            throw error;
        });

    pendingRequests.set(cacheKey, { promise, timestamp: Date.now() });
    return promise;
}

/**
 * Clear cache entries (useful for invalidation)
 */
export function clearRequestCache(pattern?: string | RegExp): void {
    if (!pattern) {
        resultCache.clear();
        pendingRequests.clear();
        return;
    }

    const isRegex = pattern instanceof RegExp;
    for (const key of resultCache.keys()) {
        if (isRegex ? pattern.test(key) : key.includes(pattern)) {
            resultCache.delete(key);
        }
    }
}

/**
 * Cache statistics for monitoring and debugging
 */
export function getRequestCacheStats() {
    return {
        total_requests: globalStats.total_requests,
        cache_hits: globalStats.cache_hits,
        cache_misses: globalStats.cache_misses,
        pending_requests: pendingRequests.size,
        cache_entries: resultCache.size,
        memory_estimate_kb: (resultCache.size * 25), // Conservative estimate
    };
}
