import { NextRequest, NextResponse } from "next/server";
import { getLanguages } from "@/lib/tmdb";
import { enforceTmdbRateLimit } from "../_shared";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = await enforceTmdbRateLimit(req);
    if (rateLimit) return rateLimit;
    const languages = await getLanguages();
    return jsonResponseWithETag(req, { languages });
  } catch (e) {
    // Fail open so profile/general can still render when TMDB is temporarily unavailable.
    return jsonResponseWithETag(req, {
      languages: [],
      degraded: true,
      error: "Failed to load languages",
    });
  }
}
