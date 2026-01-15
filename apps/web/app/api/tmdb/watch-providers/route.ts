import { NextRequest, NextResponse } from "next/server";
import { getWatchProviders } from "@/lib/tmdb";
import { enforceTmdbRateLimit } from "../_shared";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = enforceTmdbRateLimit(req);
    if (rateLimit) return rateLimit;
    const type =
      (req.nextUrl.searchParams.get("type") || "movie").toLowerCase() === "tv" ? "tv" : "movie";
    const region = (req.nextUrl.searchParams.get("region") || process.env.TMDB_REGION || "GB").trim();
    const data = await getWatchProviders(type, region || undefined);
    return jsonResponseWithETag(req, { results: data.results ?? [] });
  } catch (e) {
    return jsonResponseWithETag(req, { error: "Failed to load watch providers" }, { status: 500 });
  }
}
