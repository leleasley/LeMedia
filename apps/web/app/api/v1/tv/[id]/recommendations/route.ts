import { NextRequest } from "next/server";
import { z } from "zod";
import { getTvRecommendations } from "@/lib/tmdb";
import { verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getJellyfinItemIdByTmdb, isAvailableByTmdb } from "@/lib/jellyfin";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const parsed = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid tv id" }, { maxAge: 0, private: true });
  }

  const page = Math.max(Number(req.nextUrl.searchParams.get("page") ?? 1), 1);
  const data = await getTvRecommendations(parsed.data.id, page);

  const results = await Promise.all(
    (Array.isArray(data?.results) ? data.results : []).map(async (tv: any) => {
      const available = await isAvailableByTmdb("tv", tv.id);
      const jellyfinMediaId = available ? await getJellyfinItemIdByTmdb("tv", tv.id) : null;
      return {
        id: tv.id,
        name: tv.name,
        originalName: tv.original_name,
        overview: tv.overview,
        firstAirDate: tv.first_air_date,
        posterPath: tv.poster_path,
        backdropPath: tv.backdrop_path,
        voteAverage: tv.vote_average,
        voteCount: tv.vote_count,
        popularity: tv.popularity,
        genreIds: tv.genre_ids,
        originalLanguage: tv.original_language,
        originCountry: tv.origin_country,
        mediaType: "tv" as const,
        mediaInfo: available ? { jellyfinMediaId, status: 5 } : null
      };
    })
  );

  return cacheableJsonResponseWithETag(req, {
    page: data?.page ?? page,
    totalPages: data?.total_pages ?? 1,
    totalResults: data?.total_results ?? results.length,
    results
  }, { maxAge: 300, sMaxAge: 600 });
}
