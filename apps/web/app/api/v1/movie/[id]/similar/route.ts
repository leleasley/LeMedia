import { NextRequest } from "next/server";
import { z } from "zod";
import { getSimilarMovies } from "@/lib/tmdb";
import { extractExternalApiKey, verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getJellyfinItemIdByTmdb, isAvailableByTmdb } from "@/lib/jellyfin";

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

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const parsed = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid movie id" }, { maxAge: 0, private: true });
  }

  const page = Math.max(Number(req.nextUrl.searchParams.get("page") ?? 1), 1);
  const data = await getSimilarMovies(parsed.data.id, page);

  const results = await Promise.all(
    (Array.isArray(data?.results) ? data.results : []).map(async (movie: any) => {
      const available = await isAvailableByTmdb("movie", movie.id);
      const jellyfinMediaId = available ? await getJellyfinItemIdByTmdb("movie", movie.id) : null;
      return {
        id: movie.id,
        title: movie.title,
        originalTitle: movie.original_title,
        overview: movie.overview,
        releaseDate: movie.release_date,
        posterPath: movie.poster_path,
        backdropPath: movie.backdrop_path,
        voteAverage: movie.vote_average,
        voteCount: movie.vote_count,
        popularity: movie.popularity,
        adult: movie.adult,
        genreIds: movie.genre_ids,
        originalLanguage: movie.original_language,
        video: movie.video,
        mediaType: "movie" as const,
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
