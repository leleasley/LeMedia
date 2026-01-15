import { NextRequest, NextResponse } from "next/server";
import { getUserById, listRequestsPaged } from "@/db";
import { getJellyfinItemIdByTmdb } from "@/lib/jellyfin";
import { verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

function extractApiKey(req: NextRequest) {
    return req.headers.get("x-api-key")
        || req.headers.get("X-Api-Key")
        || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
        || req.nextUrl.searchParams.get("api_key")
        || "";
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const apiKey = extractApiKey(req);
    const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
    if (!ok) {
        return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
    }

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId <= 0) {
        return cacheableJsonResponseWithETag(req, { error: "Invalid user id" }, { maxAge: 0, private: true });
    }

    const user = await getUserById(userId);
    if (!user) {
        return cacheableJsonResponseWithETag(req, { error: "User not found" }, { maxAge: 0, private: true });
    }

    const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take") ?? 100), 1), 200);
    const skip = Math.max(Number(req.nextUrl.searchParams.get("skip") ?? 0), 0);

    const { results } = await listRequestsPaged({
        limit: take,
        offset: skip,
        requestedById: userId
    });

    // Aggregate TV episode requests per series (tmdb_id)
    const tvGroups = new Map<number, { base: typeof results[number]; requestIds: string[] }>();
    const movies: Array<typeof results[number]> = [];

    for (const r of results) {
        if (r.request_type === "episode") {
            const group = tvGroups.get(r.tmdb_id);
            if (group) {
                group.requestIds.push(r.id);
            } else {
                tvGroups.set(r.tmdb_id, { base: r, requestIds: [r.id] });
            }
        } else {
            movies.push(r);
        }
    }

    // Resolve Jellyfin media IDs and build response with TMDB fallback
    const tvResults = await Promise.all(
        Array.from(tvGroups.values()).map(async ({ base }) => {
            const jellyfinMediaId = await getJellyfinItemIdByTmdb("tv", base.tmdb_id);
            const posterUrl = `https://image.tmdb.org/t/p/w600_and_h900_bestv2/poster_placeholder.jpg`;

            return {
                id: base.id,
                status: base.status,
                type: "Series" as const,
                mediaType: "tv" as const,
                title: base.title,
                year: base.created_at ? new Date(base.created_at).getFullYear() : null,
                createdAt: base.created_at,
                media: {
                    jellyfinMediaId: jellyfinMediaId || `tmdb:${base.tmdb_id}`,
                    tmdbId: base.tmdb_id,
                    posterPath: posterUrl
                }
            };
        })
    );

    const movieResults = await Promise.all(
        movies.map(async m => {
            const jellyfinMediaId = await getJellyfinItemIdByTmdb("movie", m.tmdb_id);
            const posterUrl = `https://image.tmdb.org/t/p/w600_and_h900_bestv2/poster_placeholder.jpg`;

            return {
                id: m.id,
                status: m.status,
                type: "Movie" as const,
                mediaType: "movie" as const,
                title: m.title,
                year: m.created_at ? new Date(m.created_at).getFullYear() : null,
                createdAt: m.created_at,
                media: {
                    jellyfinMediaId: jellyfinMediaId || `tmdb:${m.tmdb_id}`,
                    tmdbId: m.tmdb_id,
                    posterPath: posterUrl
                }
            };
        })
    );

    const combined = [...tvResults, ...movieResults];

    return cacheableJsonResponseWithETag(req, {
        pageInfo: {
            results: combined.length,
            pages: Math.max(Math.ceil(combined.length / take), 1),
            page: Math.floor(skip / take) + 1,
            pageSize: take
        },
        results: combined
    }, { maxAge: 30, private: true });
}
