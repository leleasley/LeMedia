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
    return jsonResponseWithETag(req, { error: "Failed to load languages" }, { status: 500 });
  }
}
