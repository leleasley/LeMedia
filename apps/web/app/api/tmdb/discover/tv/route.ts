import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTmdbRateLimit, parsePage } from "../../_shared";
import { discoverTv, getPopularTv } from "@/lib/tmdb";
import { cacheableJsonResponseWithETag, selectFieldsInArray } from "@/lib/api-optimization";

// Essential fields for TV list - reduces payload by ~40%
const TV_LIST_FIELDS = [
  "id",
  "name",
  "poster_path",
  "backdrop_path",
  "first_air_date",
  "vote_average",
  "vote_count",
  "popularity",
  "genre_ids",
  "overview",
] as const;

export async function GET(req: NextRequest) {
  try {
    const rateLimit = enforceTmdbRateLimit(req);
    if (rateLimit) return rateLimit;
    const page = parsePage(req);
    const searchParams = req.nextUrl.searchParams;
    const allowed = [
      "sort_by",
      "with_genres",
      "first_air_date_year",
      "first_air_date.gte",
      "first_air_date.lte",
      "with_original_language",
      "with_networks",
      "with_watch_providers",
      "with_watch_monetization_types",
      "watch_region",
      "with_runtime.gte",
      "with_runtime.lte",
      "vote_average.gte",
      "vote_average.lte",
      "vote_count.gte",
      "vote_count.lte",
      "with_keywords",
      "without_keywords",
      "with_status",
    ];
    const params: Record<string, string> = {};
    for (const key of allowed) {
      const value = searchParams.get(key);
      if (value) params[key] = value;
    }

    let result = await (Object.keys(params).length === 0
      ? getPopularTv(page)
      : (params.sort_by || (params.sort_by = "popularity.desc"),
        params.watch_region && (params.with_watch_providers || params.with_watch_monetization_types)
          ? params.watch_region
          : (params.watch_region = (process.env.TMDB_REGION || "GB").trim()),
        discoverTv(params, page)));

    // Optimize response payload by selecting only essential fields
    if (result.results) {
      result.results = selectFieldsInArray(result.results, TV_LIST_FIELDS);
    }

    // Cache for 5 minutes on client, 10 minutes on CDN
    return cacheableJsonResponseWithETag(req, result, { maxAge: 300, sMaxAge: 600 });
  } catch (err) {
    if (err instanceof z.ZodError) return cacheableJsonResponseWithETag(req, { error: "Invalid page" }, { maxAge: 0 });
    return cacheableJsonResponseWithETag(req, { error: "TMDB request failed" }, { maxAge: 0 });
  }
}
