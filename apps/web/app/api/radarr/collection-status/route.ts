import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listRadarrMovies } from "@/lib/radarr";
import { findActiveRequestsByTmdbIds } from "@/db";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";

const Body = z.object({
  tmdbIds: z.array(z.coerce.number().int()).min(1).max(100)
});
const collectionRateLimit = { windowMs: 60 * 1000, max: 30 };

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const rateLimit = await enforceRateLimit(req, "radarr-collection", collectionRateLimit);
  if (rateLimit) return rateLimit;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid request" }, { maxAge: 0 });
  }

  const tmdbIds = parsed.data.tmdbIds;
  const [radarrMovies, requests] = await Promise.all([
    listRadarrMovies().catch(() => []),
    findActiveRequestsByTmdbIds({ requestType: "movie", tmdbIds }).catch(() => [])
  ]);

  const radarrByTmdb = new Map<number, any>();
  if (Array.isArray(radarrMovies)) {
    for (const movie of radarrMovies) {
      if (typeof movie?.tmdbId === "number") {
        radarrByTmdb.set(movie.tmdbId, movie);
      }
    }
  }
  const requestByTmdb = new Map<number, string>();
  for (const reqRow of requests) {
    requestByTmdb.set(reqRow.tmdb_id, reqRow.status);
  }

  const statuses: Record<number, "available" | "requested" | "already_exists"> = {};
  for (const id of tmdbIds) {
    const radarrMovie = radarrByTmdb.get(id);
    const reqStatus = requestByTmdb.get(id);
    statuses[id] = radarrMovie?.hasFile
      ? "available"
      : reqStatus
        ? "requested"
        : radarrMovie
          ? "already_exists"
          : "available";
  }

  // Cache for 2 minutes - collection status changes less frequently
  return cacheableJsonResponseWithETag(req, { statuses }, { maxAge: 120, sMaxAge: 240 });
}
