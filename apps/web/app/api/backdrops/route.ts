import { NextRequest, NextResponse } from "next/server";
import { getTrendingAll } from "@/lib/tmdb";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

function isPerson(result: any) {
  return String(result?.media_type ?? "").toLowerCase() === "person";
}

export async function GET(req: NextRequest) {
  try {
    const data = await getTrendingAll(1);
    const results = Array.isArray(data?.results) ? data.results : [];
    const backdrops = results
      .filter((result: any) => !isPerson(result))
      .map((result: any) => result?.backdrop_path)
      .filter(Boolean);

    return jsonResponseWithETag(req, backdrops);
  } catch (error) {
    logger.error("[backdrops] failed to load TMDB backdrops", error);
    return jsonResponseWithETag(req, { error: "Unable to retrieve backdrops." }, { status: 500 });
  }
}
