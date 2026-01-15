import { NextRequest, NextResponse } from "next/server";
import { getRequestCacheStats } from "@/lib/request-cache";
import { requireAdmin } from "@/auth";
import { jsonResponseWithETag } from "@/lib/api-optimization";

/**
 * Debug endpoint to monitor performance optimization metrics
 * Shows deduplication cache hit rates, pending requests, and overall effectiveness
 * 
 * Example response:
 * {
 *   "timestamp": "2024-01-15T10:30:45.123Z",
 *   "cache_stats": {
 *     "total_requests": 1542,
 *     "cache_hits": 928,
 *     "cache_misses": 614,
 *     "hit_rate": "60.18%",
 *     "pending_requests": 3,
 *     "cache_entries": 42,
 *     "deduplication_savings": "60.18% fewer API calls"
 *   },
 *   "top_cached_keys": [
 *     { "key": "tmdb:...", "hits": 127, "misses": 8 },
 *     ...
 *   ]
 * }
 */
export async function GET(req: NextRequest) {
    // Optional: Check for auth header in production
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.DEBUG_API_KEY;

    // If DEBUG_API_KEY is set, require it; otherwise require admin session
    if (expectedKey) {
        if (apiKey !== expectedKey) {
            return jsonResponseWithETag(req, { error: "Unauthorized" }, { status: 401 });
        }
    } else {
        const admin = await requireAdmin();
        if (admin instanceof NextResponse) return admin;
    }

    const stats = getRequestCacheStats();
    const hitRate =
        stats.total_requests > 0
            ? ((stats.cache_hits / stats.total_requests) * 100).toFixed(2)
            : "0.00";

    const response = {
        timestamp: new Date().toISOString(),
        cache_stats: {
            total_requests: stats.total_requests,
            cache_hits: stats.cache_hits,
            cache_misses: stats.cache_misses,
            hit_rate: `${hitRate}%`,
            pending_requests: stats.pending_requests,
            cache_entries: stats.cache_entries,
            deduplication_savings: `${hitRate}% fewer API calls due to deduplication`,
        },
        // Calculate bandwidth saved by deduplication (rough estimate)
        bandwidth_saved_mb: (
            (stats.cache_hits * 0.025) / // Assume ~25KB average response
            1024 // Convert to MB
        ).toFixed(2),
        // Rough latency improvement estimate
        latency_improvement_ms: Math.round(stats.cache_hits * 150), // 150ms per avoided API call
    };

    // Don't cache this endpoint - it changes frequently
    const headers = new Headers();
    headers.set("Cache-Control", "no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Content-Type", "application/json");

    return new NextResponse(JSON.stringify(response, null, 2), {
        status: 200,
        headers,
    });
}
