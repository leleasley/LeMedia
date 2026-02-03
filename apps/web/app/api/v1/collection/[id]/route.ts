import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/tmdb";
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const { id } = await params;
  const collectionId = Number(id);

  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const collection = await getCollection(collectionId);

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // Map collection parts (movies) to include Jellyfin IDs
  const parts = await Promise.all(
    (collection.parts || []).map(async (movie: any) => {
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
    id: collection.id,
    name: collection.name,
    overview: collection.overview,
    posterPath: collection.poster_path,
    backdropPath: collection.backdrop_path,
    parts
  }, { maxAge: 3600, sMaxAge: 7200 });
}
