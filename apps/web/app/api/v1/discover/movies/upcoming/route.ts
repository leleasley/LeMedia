import { NextRequest } from "next/server";
import { getUpcomingMoviesAccurateCombined } from "@/lib/tmdb";
import { extractExternalApiKey, verifyExternalApiKey } from "@/lib/external-api";
import { mapDiscoverResults } from "../../_helpers";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || extractExternalApiKey(req)
    || "";
}

export async function GET(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const page = Math.max(Number(req.nextUrl.searchParams.get("page") ?? 1), 1);
  const data: any = await getUpcomingMoviesAccurateCombined(page);
  const results = await mapDiscoverResults(Array.isArray(data?.results) ? data.results : [], "movie");

  return cacheableJsonResponseWithETag(req, {
    page: data?.page ?? page,
    totalPages: data?.total_pages ?? data?.totalPages ?? 1,
    totalResults: data?.total_results ?? data?.totalResults ?? results.length,
    results
  }, { maxAge: 300, sMaxAge: 600 });
}
