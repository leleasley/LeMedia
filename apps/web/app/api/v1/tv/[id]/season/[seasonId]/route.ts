import { NextRequest } from "next/server";
import { z } from "zod";
import { getTvSeason } from "@/lib/tmdb";
import { extractExternalApiKey, verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || extractExternalApiKey(req)
    || "";
}

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  seasonId: z.coerce.number().int().nonnegative()
});

type ParamsInput = { id: string; seasonId: string } | Promise<{ id: string; seasonId: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string; seasonId: string }>);
  return params as { id: string; seasonId: string };
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const parsed = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid tv season" }, { maxAge: 0, private: true });
  }

  const tvId = parsed.data.id;
  const seasonNumber = parsed.data.seasonId;
  const season = await getTvSeason(tvId, seasonNumber);

  const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
  const externalIds = season?.external_ids ?? {};

  return cacheableJsonResponseWithETag(req, {
    airDate: season?.air_date ?? null,
    episodes: episodes.map((episode: any) => ({
      id: episode.id,
      airDate: episode.air_date ?? null,
      episodeNumber: episode.episode_number,
      name: episode.name,
      overview: episode.overview,
      productionCode: episode.production_code,
      seasonNumber: episode.season_number,
      showId: episode.show_id,
      voteAverage: episode.vote_average,
      voteCount: episode.vote_count,
      stillPath: episode.still_path ?? null
    })),
    externalIds: {
      tvdbId: externalIds.tvdb_id ?? null,
      imdbId: externalIds.imdb_id ?? null,
      tvrageId: externalIds.tvrage_id ?? null
    },
    id: season?.id ?? null,
    name: season?.name ?? null,
    overview: season?.overview ?? null,
    seasonNumber: season?.season_number ?? seasonNumber,
    posterPath: season?.poster_path ?? null
  }, { maxAge: 300, sMaxAge: 600 });
}
