import { NextRequest } from "next/server";
import { z } from "zod";
import { getPersonCombinedCredits } from "@/lib/tmdb";
import { extractExternalApiKey, verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getJellyfinItemIdByTmdb, isAvailableByTmdb } from "@/lib/jellyfin";
import { tmdbImageUrl } from "@/lib/tmdb-images";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || extractExternalApiKey(req)
    || "";
}

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

async function mapCredit(item: any) {
  const mediaType = item.media_type === "tv" ? "tv" : item.media_type === "movie" ? "movie" : item.media_type;
  const available = (mediaType === "movie" || mediaType === "tv")
    ? await isAvailableByTmdb(mediaType, item.id)
    : null;
  const jellyfinMediaId = available ? await getJellyfinItemIdByTmdb(mediaType as "movie" | "tv", item.id) : null;

  return {
    id: item.id,
    originalLanguage: item.original_language ?? null,
    episodeCount: item.episode_count ?? null,
    overview: item.overview ?? null,
    originCountry: item.origin_country ?? [],
    originalName: item.original_name ?? null,
    voteCount: item.vote_count ?? null,
    name: item.name ?? null,
    mediaType: mediaType ?? null,
    popularity: item.popularity ?? null,
    creditId: item.credit_id ?? null,
    backdropPath: tmdbImageUrl(item.backdrop_path, "w780"),
    firstAirDate: item.first_air_date ?? null,
    voteAverage: item.vote_average ?? null,
    genreIds: item.genre_ids ?? [],
    posterPath: tmdbImageUrl(item.poster_path, "w500"),
    profilePath: tmdbImageUrl(item.profile_path, "w500"),
    originalTitle: item.original_title ?? null,
    video: !!item.video,
    title: item.title ?? null,
    adult: !!item.adult,
    releaseDate: item.release_date ?? null,
    character: item.character ?? null,
    department: item.department ?? null,
    job: item.job ?? null,
    mediaInfo: available ? { jellyfinMediaId, status: 5 } : null
  };
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const parsed = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid person id" }, { maxAge: 0, private: true });
  }

  const credits = await getPersonCombinedCredits(parsed.data.id);
  const cast = await Promise.all((credits?.cast ?? []).map(mapCredit));
  const crew = await Promise.all((credits?.crew ?? []).map(mapCredit));

  return cacheableJsonResponseWithETag(req, {
    id: parsed.data.id,
    cast,
    crew
  }, { maxAge: 300, sMaxAge: 600 });
}
