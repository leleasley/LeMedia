/**
 * API optimization utilities - reduce payload size, add proper caching headers
 */

import { NextResponse } from "next/server";

type CacheControlOptions = {
    maxAge?: number; // max-age in seconds
    sMaxAge?: number; // s-maxage for CDN
    revalidate?: number; // ISR revalidation in seconds
    staleWhileRevalidate?: number; // stale-while-revalidate in seconds
    public?: boolean;
    private?: boolean;
};

function buildCacheControl(options?: CacheControlOptions) {
    const {
        maxAge = 300, // 5 minutes default
        sMaxAge = 600, // 10 minutes for CDN
        staleWhileRevalidate,
        public: isPublic = true,
        private: isPrivate = false,
    } = options || {};

    const scope = isPrivate ? "private" : isPublic ? "public" : "public";
    const cacheControlParts = [`${scope}`, `max-age=${maxAge}`, `s-maxage=${sMaxAge}`];
    if (typeof staleWhileRevalidate === "number") {
        cacheControlParts.push(`stale-while-revalidate=${staleWhileRevalidate}`);
    }
    return cacheControlParts.join(", ");
}

function normalizeEtag(value: string) {
    return value.replace(/^W\//, "").trim();
}

function ifNoneMatchMatches(ifNoneMatch: string | null, etag: string) {
    if (!ifNoneMatch) return false;
    if (ifNoneMatch.trim() === "*") return true;
    const normalized = normalizeEtag(etag);
    return ifNoneMatch
        .split(",")
        .map(part => normalizeEtag(part.trim()))
        .includes(normalized);
}

/**
 * Cached API response with proper HTTP headers
 */
export function cacheableJsonResponse<T>(data: T, options?: CacheControlOptions) {
    const cacheControl = buildCacheControl(options);
    const response = NextResponse.json(data);
    response.headers.set("Cache-Control", cacheControl);
    response.headers.set("Content-Type", "application/json; charset=utf-8");

    return response;
}

export function cacheableJsonResponseWithETag<T>(req: Request, data: T, options?: CacheControlOptions) {
    const cacheControl = buildCacheControl(options);
    const etag = `"${hashData(data)}"`;
    if (ifNoneMatchMatches(req.headers.get("if-none-match"), etag)) {
        const response = new NextResponse(null, { status: 304 });
        response.headers.set("ETag", etag);
        response.headers.set("Cache-Control", cacheControl);
        response.headers.set("Content-Type", "application/json; charset=utf-8");
        return response;
    }

    const response = NextResponse.json(data);
    response.headers.set("ETag", etag);
    response.headers.set("Cache-Control", cacheControl);
    response.headers.set("Content-Type", "application/json; charset=utf-8");
    return response;
}

/**
 * Filter object to only include specified fields (reduce payload)
 */
export function selectFields<T extends Record<string, any>>(
    obj: T,
    fields: readonly (keyof T)[]
): Partial<T> {
    const result: Partial<T> = {};
    for (const field of fields) {
        if (field in obj) {
            result[field] = obj[field];
        }
    }
    return result;
}

/**
 * Filter array of objects to only include specified fields
 */
export function selectFieldsInArray<T extends Record<string, any>>(
    arr: T[],
    fields: readonly (keyof T)[]
): Partial<T>[] {
    return arr.map((item) => selectFields(item, fields));
}

/**
 * Add proper cache headers to response
 */
export function withCacheHeaders(response: Response, maxAge: number = 300) {
    response.headers.set("Cache-Control", `public, max-age=${maxAge}`);
    return response;
}

/**
 * Batch multiple requests to reduce round trips
 */
export async function batchRequests<T>(
    fetchers: (() => Promise<T>)[],
    options?: { maxConcurrent?: number; timeout?: number }
) {
    const { maxConcurrent = 10, timeout = 30000 } = options || {};
    const results: T[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < fetchers.length; i += maxConcurrent) {
        const batch = fetchers.slice(i, i + maxConcurrent);
        const batchResults = await Promise.allSettled(
            batch.map(
                (fetcher) =>
                    new Promise<T>((resolve, reject) => {
                        const timer = setTimeout(() => reject(new Error("Request timeout")), timeout);
                        fetcher()
                            .then((result) => {
                                clearTimeout(timer);
                                resolve(result);
                            })
                            .catch((error) => {
                                clearTimeout(timer);
                                reject(error);
                            });
                    })
            )
        );

        batchResults.forEach((result) => {
            if (result.status === "fulfilled") {
                results.push(result.value);
            } else {
                errors.push(result.reason);
            }
        });
    }

    return { results, errors };
}

/**
 * Add ETag support for response validation
 */
export function hashData(data: any): string {
    const json = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
        const char = json.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Create response with ETag and optional init overrides.
 */
export function jsonResponseWithETag<T>(req: Request, data: T, init?: ResponseInit) {
    const etag = `"${hashData(data)}"`;
    const cacheControl = "private, max-age=0, must-revalidate";

    if (ifNoneMatchMatches(req.headers.get("if-none-match"), etag)) {
        const response = new NextResponse(null, { status: 304 });
        response.headers.set("ETag", etag);
        response.headers.set("Cache-Control", cacheControl);
        return response;
    }

    const response = NextResponse.json(data, init);
    response.headers.set("ETag", etag);
    response.headers.set("Cache-Control", cacheControl);
    return response;
}
