import { NextRequest, NextResponse } from "next/server";
import { getMovieGenres, getTvGenres } from "@/lib/tmdb-genres";
import { enforceTmdbRateLimit } from "../_shared";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
    try {
        const rateLimit = await enforceTmdbRateLimit(req);
        if (rateLimit) return rateLimit;
        const url = new URL(req.url);
        const type = (url.searchParams.get("type") || "movie").toLowerCase();
        const genres = type === "tv" ? await getTvGenres() : await getMovieGenres();
        return jsonResponseWithETag(req, { genres });
    } catch (e) {
        return jsonResponseWithETag(req, { error: "Failed to load genres" }, { status: 500 });
    }
}
