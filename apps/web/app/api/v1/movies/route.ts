import { NextRequest } from "next/server";
import { getPopularMovies } from "@/lib/tmdb";
import { verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getJellyfinItemIdByTmdb } from "@/lib/jellyfin";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

export async function GET(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const page = Math.max(Number(req.nextUrl.searchParams.get("page") ?? 1), 1);
  const data = await getPopularMovies(page);

  // Map results to include Jellyfin IDs
  const results = await Promise.all(
    (Array.isArray(data?.results) ? data.results : []).map(async (movie: any) => {
      const jellyfinMediaId = await getJellyfinItemIdByTmdb("movie", movie.id);
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
        mediaType: "movie",
        mediaInfo: jellyfinMediaId ? {
          jellyfinMediaId,
          status: 3 // available
        } : null
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
