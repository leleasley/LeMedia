import { NextRequest } from "next/server";
import { searchMulti } from "@/lib/tmdb";
import { verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getJellyfinItemIdByTmdb, isAvailableByTmdb } from "@/lib/jellyfin";
import { tmdbImageUrl } from "@/lib/tmdb-images";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

type TmdbSearchItem = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  backdrop_path?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  overview?: string;
  adult?: boolean;
  original_language?: string;
  origin_country?: string[];
  profile_path?: string;
  known_for?: TmdbSearchItem[];
};

function buildMediaInfo(jellyfinMediaId: string | null, available: boolean | null) {
  if (!available) return { jellyfinMediaId: null, status: 1 };
  return { jellyfinMediaId, status: 5 };
}

async function mapSearchItem(item: TmdbSearchItem) {
  const mediaType = item.media_type === "tv" ? "tv" : item.media_type === "movie" ? "movie" : item.media_type;
  if (mediaType === "movie" || mediaType === "tv") {
    const available = await isAvailableByTmdb(mediaType, item.id);
    const jellyfinMediaId = available ? await getJellyfinItemIdByTmdb(mediaType, item.id) : null;
    return {
      id: item.id,
      mediaType,
      popularity: item.popularity ?? 0,
      posterPath: tmdbImageUrl(item.poster_path, "w500"),
      backdropPath: tmdbImageUrl(item.backdrop_path, "w780"),
      voteCount: item.vote_count ?? 0,
      voteAverage: item.vote_average ?? 0,
      genreIds: item.genre_ids ?? [],
      overview: item.overview ?? "",
      originalLanguage: item.original_language ?? "",
      title: item.title ?? null,
      originalTitle: item.original_title ?? null,
      releaseDate: item.release_date ?? null,
      adult: !!item.adult,
      video: false,
      name: item.name ?? null,
      originalName: item.original_name ?? null,
      firstAirDate: item.first_air_date ?? null,
      originCountry: item.origin_country ?? [],
      mediaInfo: buildMediaInfo(jellyfinMediaId, available)
    };
  }

  if (mediaType === "person") {
    const knownFor = await Promise.all(
      (item.known_for ?? []).map(async (known) => {
        const knownType = known.media_type === "tv" ? "tv" : known.media_type === "movie" ? "movie" : null;
        if (!knownType) return null;
        const available = await isAvailableByTmdb(knownType, known.id);
        const jellyfinMediaId = available ? await getJellyfinItemIdByTmdb(knownType, known.id) : null;
        return {
          id: known.id,
          mediaType: knownType,
          popularity: known.popularity ?? 0,
          posterPath: tmdbImageUrl(known.poster_path, "w500"),
          backdropPath: tmdbImageUrl(known.backdrop_path, "w780"),
          voteCount: known.vote_count ?? 0,
          voteAverage: known.vote_average ?? 0,
          genreIds: known.genre_ids ?? [],
          overview: known.overview ?? "",
          originalLanguage: known.original_language ?? "",
          title: known.title ?? null,
          originalTitle: known.original_title ?? null,
          releaseDate: known.release_date ?? null,
          adult: !!known.adult,
          video: false,
          name: known.name ?? null,
          originalName: known.original_name ?? null,
          firstAirDate: known.first_air_date ?? null,
          originCountry: known.origin_country ?? [],
          mediaInfo: buildMediaInfo(jellyfinMediaId, available)
        };
      })
    );
    return {
      id: item.id,
      mediaType: "person",
      name: item.name ?? null,
      popularity: item.popularity ?? 0,
      profilePath: tmdbImageUrl(item.profile_path, "w500"),
      adult: !!item.adult,
      knownFor: knownFor.filter(Boolean)
    };
  }

  if (mediaType === "collection") {
    return {
      id: item.id,
      mediaType: "collection",
      title: item.title ?? null,
      originalTitle: item.original_title ?? null,
      adult: !!item.adult,
      posterPath: tmdbImageUrl(item.poster_path, "w500"),
      backdropPath: tmdbImageUrl(item.backdrop_path, "w780"),
      overview: item.overview ?? "",
      originalLanguage: item.original_language ?? ""
    };
  }

  return null;
}

export async function GET(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const query = (req.nextUrl.searchParams.get("query") ?? "").trim();
  if (!query) {
    return cacheableJsonResponseWithETag(req, { page: 1, totalPages: 1, totalResults: 0, results: [] }, { maxAge: 60, sMaxAge: 120 });
  }

  const page = Math.max(Number(req.nextUrl.searchParams.get("page") ?? 1), 1);
  const data = await searchMulti(query, page);
  const rawResults = Array.isArray(data?.results) ? data.results : [];
  const mapped = (await Promise.all(rawResults.map(mapSearchItem))).filter(Boolean);

  return cacheableJsonResponseWithETag(req, {
    page: data?.page ?? page,
    totalPages: data?.total_pages ?? 1,
    totalResults: data?.total_results ?? mapped.length,
    results: mapped
  }, { maxAge: 300, sMaxAge: 600 });
}
