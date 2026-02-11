import { NextRequest } from "next/server";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getTv } from "@/lib/tmdb";
import { z } from "zod";

const Params = z.object({ id: z.coerce.number().int().positive() });
const tmdbRateLimit = {
  windowMs: 60 * 1000,
  max: Math.max(1, Number(process.env.TMDB_RATE_LIMIT_MAX ?? "300") || 300)
};

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") {
    return await params;
  }
  return params;
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const rateLimit = await enforceRateLimit(req, "tmdb", tmdbRateLimit);
  if (rateLimit) return rateLimit;

  const resolved = await resolveParams(params);
  const parsed = Params.safeParse(resolved);
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid TV id" }, { maxAge: 0, private: true });
  }

  try {
    const tv = await getTv(parsed.data.id);
    type TvSeason = {
      id?: number | null;
      season_number: number;
      episode_count: number;
      name?: string | null;
      poster_path?: string | null;
    };

    const seasons = Array.isArray(tv.seasons)
      ? tv.seasons
          .filter((season: TvSeason) => season.season_number > 0 || tv.seasons?.length === 1)
          .map((season: TvSeason) => ({
            id: season.id ?? null,
            season_number: season.season_number,
            episode_count: season.episode_count,
            name: season.name ?? `Season ${season.season_number}`,
            poster_path: season.poster_path ?? null
          }))
      : [];

    return cacheableJsonResponseWithETag(
      req,
      { seasons },
      { maxAge: 300, sMaxAge: 600 }
    );
  } catch (error) {
    return cacheableJsonResponseWithETag(req, { error: "Failed to load TV data" }, { maxAge: 0 });
  }
}
