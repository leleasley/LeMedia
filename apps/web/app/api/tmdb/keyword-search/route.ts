import { NextRequest, NextResponse } from "next/server";
import { searchKeywords } from "@/lib/tmdb";
import { enforceTmdbRateLimit } from "../_shared";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = enforceTmdbRateLimit(req);
    if (rateLimit) return rateLimit;
    const query = (req.nextUrl.searchParams.get("query") || "").trim();
    if (!query) return jsonResponseWithETag(req, { results: [] });
    if (query.length > 100) {
      return jsonResponseWithETag(req, { error: "Query too long" }, { status: 400 });
    }
    const data = await searchKeywords(query);
    return jsonResponseWithETag(req, { results: data.results ?? [] });
  } catch {
    return jsonResponseWithETag(req, { error: "Failed to search keywords" }, { status: 500 });
  }
}

