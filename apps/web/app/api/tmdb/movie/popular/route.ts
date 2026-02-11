import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTmdbRateLimit, parsePage } from "../../_shared";
import { getPopularMovies } from "@/lib/tmdb";
import { cacheableJsonResponseWithETag, selectFieldsInArray } from "@/lib/api-optimization";

// Essential fields for movie list - reduces payload by ~40%
const MOVIE_LIST_FIELDS = [
  "id",
  "title",
  "poster_path",
  "backdrop_path",
  "release_date",
  "vote_average",
  "vote_count",
  "popularity",
  "genre_ids",
  "overview",
] as const;

export async function GET(req: NextRequest) {
  try {
    const rateLimit = await enforceTmdbRateLimit(req);
    if (rateLimit) return rateLimit;
    const page = parsePage(req);
    let result = await getPopularMovies(page);

    // Optimize response payload by selecting only essential fields
    if (result.results) {
      result.results = selectFieldsInArray(result.results, MOVIE_LIST_FIELDS);
    }

    // Cache for 5 minutes on client, 10 minutes on CDN
    return cacheableJsonResponseWithETag(req, result, { maxAge: 300, sMaxAge: 600 });
  } catch (err) {
    if (err instanceof z.ZodError) return cacheableJsonResponseWithETag(req, { error: "Invalid page" }, { maxAge: 0 });
    return cacheableJsonResponseWithETag(req, { error: "TMDB request failed" }, { maxAge: 0 });
  }
}
