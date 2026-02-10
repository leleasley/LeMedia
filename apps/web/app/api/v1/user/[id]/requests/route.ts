import { NextRequest, NextResponse } from "next/server";
import { getUserById, listRequestsPaged, listRequestItems } from "@/db";
import { getJellyfinItemIdByTmdb, getJellyfinItemIdByName } from "@/lib/jellyfin";
import { extractExternalApiKey, verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\\s+/i, "")
    || extractExternalApiKey(req)
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

  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take") ?? 20), 1), 100);
  const skip = Math.max(Number(req.nextUrl.searchParams.get("skip") ?? 0), 0);

  const { total, results } = await listRequestsPaged({
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

  // Resolve Jellyfin media IDs per tmdb and collect requested episode details per series
  const tvResults = await Promise.all(
    Array.from(tvGroups.values()).map(async ({ base, requestIds }) => {
      let jellyfinMediaId = await getJellyfinItemIdByTmdb("tv", base.tmdb_id);
      if (!jellyfinMediaId) {
        jellyfinMediaId = await getJellyfinItemIdByName("tv", base.title);
      }
      return {
        id: base.id,
        status: base.status,
        type: "tv" as const,
        mediaType: "tv" as const,
        title: base.title,
        createdAt: base.created_at,
        media: { jellyfinMediaId: jellyfinMediaId ?? null }
      };
    })
  );

  const movieResults = await Promise.all(
    movies.map(async m => {
      let jellyfinMediaId = await getJellyfinItemIdByTmdb("movie", m.tmdb_id);
      if (!jellyfinMediaId) {
        jellyfinMediaId = await getJellyfinItemIdByName("movie", m.title);
      }
      return {
        id: m.id,
        status: m.status,
        type: "movie" as const,
        mediaType: "movie" as const,
        title: m.title,
        createdAt: m.created_at,
        media: { jellyfinMediaId: jellyfinMediaId ?? null }
      };
    })
  );

  const combined = [...tvResults, ...movieResults];

  return cacheableJsonResponseWithETag(req, {
    pageInfo: {
      results: total,
      pages: Math.max(Math.ceil(total / take), 1),
      page: Math.floor(skip / take) + 1,
      pageSize: take
    },
    results: combined
  }, { maxAge: 30, private: true });
}
