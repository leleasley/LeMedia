import { NextRequest, NextResponse } from "next/server";
import { getActiveMediaService } from "@/lib/media-services";
import { getTvExternalIds } from "@/lib/tmdb";
import { lookupSeriesByTvdbForService } from "@/lib/sonarr";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

type Context = { params: Promise<{ tmdbId: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const resolvedParams = await params;
  const tmdbId = Number(resolvedParams.tmdbId);
  if (!Number.isFinite(tmdbId)) {
    return cacheableJsonResponseWithETag(_req, { error: "Invalid TMDB id" }, { maxAge: 0, private: true });
  }

  const external = await getTvExternalIds(tmdbId).catch(() => null);
  const tvdbId = external?.tvdb_id;
  if (!tvdbId) {
    return cacheableJsonResponseWithETag(_req, { error: "TVDB id unavailable" }, { maxAge: 0, private: true });
  }

  const service = await getActiveMediaService("sonarr");
  if (!service) {
    return cacheableJsonResponseWithETag(_req, { error: "No Sonarr service configured" }, { maxAge: 0, private: true });
  }

  try {
    const results = await lookupSeriesByTvdbForService(service.base_url, service.apiKey, tvdbId);
    return cacheableJsonResponseWithETag(_req, results, { maxAge: 300, sMaxAge: 600 });
  } catch (error: any) {
    return cacheableJsonResponseWithETag(_req, { error: error?.message ?? "Lookup failed" }, { maxAge: 0, private: true });
  }
}
