import { getJellyfinItemIdByTmdb, isAvailableByTmdb } from "@/lib/jellyfin";
import { tmdbImageUrl } from "@/lib/tmdb-images";

type TmdbItem = {
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
};

export async function mapDiscoverResults(items: TmdbItem[], forcedType?: "movie" | "tv") {
  const mapped = await Promise.all(
    items.map(async item => {
      const mediaType = forcedType ?? (item.media_type === "tv" ? "tv" : "movie");
      const available = await isAvailableByTmdb(mediaType, item.id);
      const jellyfinMediaId = available ? await getJellyfinItemIdByTmdb(mediaType, item.id) : null;
      return {
        id: item.id,
        mediaType,
        adult: !!item.adult,
        originalLanguage: item.original_language ?? null,
        title: item.title ?? null,
        name: item.name ?? null,
        originalTitle: item.original_title ?? null,
        originalName: item.original_name ?? null,
        releaseDate: item.release_date ?? null,
        firstAirDate: item.first_air_date ?? null,
        posterPath: tmdbImageUrl(item.poster_path, "w500"),
        backdropPath: tmdbImageUrl(item.backdrop_path, "w780"),
        popularity: item.popularity ?? null,
        voteAverage: item.vote_average ?? null,
        voteCount: item.vote_count ?? null,
        genreIds: item.genre_ids ?? [],
        overview: item.overview ?? null,
        mediaInfo: available ? { jellyfinMediaId, status: 5 } : null
      };
    })
  );

  return mapped;
}
