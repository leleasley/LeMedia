import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTmdbRateLimit, parsePage } from "../../_shared";
import { getUpcomingTvAccurate } from "@/lib/tmdb";
import { cacheableJsonResponseWithETag, selectFieldsInArray } from "@/lib/api-optimization";

const TV_LIST_FIELDS = ["id", "name", "poster_path", "backdrop_path", "first_air_date", "vote_average", "vote_count", "popularity", "genre_ids", "overview"] as const;

export async function GET(req: NextRequest) {
    try {
        const rateLimit = await enforceTmdbRateLimit(req);
        if (rateLimit) return rateLimit;
        const page = parsePage(req);
        let result = await getUpcomingTvAccurate(page);
        if (result.results) {
            result.results = selectFieldsInArray(result.results, TV_LIST_FIELDS);
        }
        return cacheableJsonResponseWithETag(req, result, { maxAge: 300, sMaxAge: 600 });
    } catch (err) {
        if (err instanceof z.ZodError) return cacheableJsonResponseWithETag(req, { error: "Invalid page" }, { maxAge: 0 });
        return cacheableJsonResponseWithETag(req, { error: "TMDB request failed" }, { maxAge: 0 });
    }
}
