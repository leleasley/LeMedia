import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getUser } from "@/auth";
import { listRequestsByUsername } from "@/db";
import { getMovie, getTv } from "@/lib/tmdb";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await getUser().catch(() => null);
    if (!user) {
      return jsonResponseWithETag(request, { error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);

    const requests = await listRequestsByUsername(user.username, limit);

    const tmdbResults = await Promise.allSettled(
      requests.map((req) => (req.request_type === "movie" ? getMovie(req.tmdb_id) : getTv(req.tmdb_id)))
    );

    const enriched = requests.map((req, idx) => {
      const result = tmdbResults[idx];
      if (result.status === "fulfilled") {
        const tmdbData = result.value as any;
        return {
          id: req.id,
          title: req.title,
          tmdb_id: req.tmdb_id,
          request_type: req.request_type,
          status: req.status,
          created_at: req.created_at,
          backdrop_path: tmdbData?.backdrop_path || null,
          poster_path: tmdbData?.poster_path || null,
        };
      }
      logger.error(`Failed to fetch TMDB data for ${req.tmdb_id}:`, result.reason);
      return {
        id: req.id,
        title: req.title,
        tmdb_id: req.tmdb_id,
        request_type: req.request_type,
        status: req.status,
        created_at: req.created_at,
        backdrop_path: null,
        poster_path: null,
      };
    });

    return cacheableJsonResponseWithETag(request, { requests: enriched }, { maxAge: 0, sMaxAge: 0, private: true });
  } catch (error: any) {
    logger.error("Error fetching profile requests:", error);
    return jsonResponseWithETag(request, 
      { error: error?.message ?? "Failed to fetch requests" },
      { status: 500 }
    );
  }
}
