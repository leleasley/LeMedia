import { NextRequest } from "next/server";
import { getSimilarTv } from "@/lib/tmdb";
import { cacheableJsonResponseWithETag, selectFieldsInArray } from "@/lib/api-optimization";
import { enforceTmdbRateLimit, parsePage } from "../../../_shared";
import { logger } from "@/lib/logger";

const TV_LIST_FIELDS = ["id", "name", "poster_path", "backdrop_path", "first_air_date", "vote_average", "vote_count", "popularity", "genre_ids", "overview"] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const rateLimit = enforceTmdbRateLimit(request);
    if (rateLimit) return rateLimit;
    const resolvedParams = await Promise.resolve(params);
    const id = parseInt(resolvedParams.id);

    if (isNaN(id)) {
      return cacheableJsonResponseWithETag(request, { error: "Invalid TV ID" }, { maxAge: 0 });
    }

    const page = parsePage(request);

    let data = await getSimilarTv(id, page);

    // Optimize response payload
    if (data.results) {
      data.results = selectFieldsInArray(data.results, TV_LIST_FIELDS);
    }

    // Cache similar TV for 1 hour
    return cacheableJsonResponseWithETag(request, data, { maxAge: 3600, sMaxAge: 7200 });
  } catch (error) {
    logger.error("Error fetching similar TV shows:", error);
    return cacheableJsonResponseWithETag(request, 
      { error: "Failed to fetch similar TV shows" },
      { maxAge: 0 }
    );
  }
}
