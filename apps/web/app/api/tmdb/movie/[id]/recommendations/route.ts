import { NextRequest } from "next/server";
import { getMovieRecommendations } from "@/lib/tmdb";
import { cacheableJsonResponseWithETag, selectFieldsInArray } from "@/lib/api-optimization";
import { enforceTmdbRateLimit, parsePage } from "../../../_shared";
import { logger } from "@/lib/logger";

const MOVIE_LIST_FIELDS = ["id", "title", "poster_path", "backdrop_path", "release_date", "vote_average", "vote_count", "popularity", "genre_ids", "overview"] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const rateLimit = await enforceTmdbRateLimit(request);
    if (rateLimit) return rateLimit;
    const resolvedParams = await Promise.resolve(params);
    const id = parseInt(resolvedParams.id);

    if (isNaN(id)) {
      return cacheableJsonResponseWithETag(request, { error: "Invalid movie ID" }, { maxAge: 0 });
    }

    const page = parsePage(request);

    let data = await getMovieRecommendations(id, page);

    // Optimize response payload
    if (data.results) {
      data.results = selectFieldsInArray(data.results, MOVIE_LIST_FIELDS);
    }

    // Cache recommendations for 1 hour - less volatile than search
    return cacheableJsonResponseWithETag(request, data, { maxAge: 3600, sMaxAge: 7200 });
  } catch (error) {
    logger.error("Error fetching movie recommendations:", error);
    return cacheableJsonResponseWithETag(request, 
      { error: "Failed to fetch recommendations" },
      { maxAge: 0 }
    );
  }
}
