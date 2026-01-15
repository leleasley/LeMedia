import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTv, getTvWatchProviders } from "@/lib/tmdb";
import { getTVRatings } from "@/lib/rottentomatoes";
import { getOmdbData } from "@/lib/omdb";
import { enforceRateLimit } from "@/lib/rate-limit";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const Params = z.object({ id: z.coerce.number().int() });
const mediaInfoRateLimit = { windowMs: 60 * 1000, max: 60 };

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") {
    return await (params as Promise<{ id: string }>);
  }
  return params as { id: string };
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const rateLimit = enforceRateLimit(req, "media-info", mediaInfoRateLimit);
  if (rateLimit) return rateLimit;
  const parsed = Params.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return jsonResponseWithETag(req, { error: "Invalid id" }, { status: 400 });
  }

  const tv = await getTv(parsed.data.id);
  const region = process.env.TMDB_REGION || "GB";

  const [providersResult, rtRatings] = await Promise.all([
    getTvWatchProviders(parsed.data.id).catch(() => null),
    tv.name && tv.first_air_date
      ? getTVRatings(tv.name, tv.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : undefined).catch(() => null)
      : Promise.resolve(null)
  ]);

  let imdbRating: string | null = null;
  let metacriticScore: string | null = null;
  const imdbId = tv.external_ids?.imdb_id;
  const omdbEnabled = process.env.OMDB_ENABLED !== "0";
  if (omdbEnabled && imdbId) {
    try {
      const omdbData = await getOmdbData(imdbId).catch(() => null);
      imdbRating = omdbData?.imdbRating || null;
      metacriticScore = omdbData?.Metascore && omdbData.Metascore !== "N/A" ? omdbData.Metascore : null;
    } catch {
      // ignore
    }
  }

  const streamingProviders = providersResult?.results?.[region]?.flatrate || [];

  return jsonResponseWithETag(req, {
    streamingProviders,
    imdbId,
    imdbRating,
    metacriticScore,
    rtCriticsScore: rtRatings?.criticsScore ?? null,
    rtCriticsRating: rtRatings?.criticsRating ?? null,
    rtAudienceScore: rtRatings?.audienceScore ?? null,
    rtAudienceRating: rtRatings?.audienceRating ?? null,
    rtUrl: rtRatings?.url ?? null
  });
}
