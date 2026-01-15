import MoviesPageClient from "./MoviesPageClient";
import type { MediaGridPage, MediaGridItem } from "@/types/media-grid";
import { getPopularMovies } from "@/lib/tmdb";
import { selectFieldsInArray } from "@/lib/api-optimization";

type SearchParams = Record<string, string | string[] | undefined>;

const MOVIE_LIST_FIELDS = [
  "id",
  "title",
  "poster_path",
  "backdrop_path",
  "release_date",
  "vote_average",
  "vote_count",
  "popularity",
  "genre_ids",
  "overview",
  "media_type",
] as const;

async function fetchInitialMovies() {
  try {
    const pages = await Promise.all([1, 2, 3].map(page => getPopularMovies(page)));
    return pages.map((page) => ({
      ...page,
      results: selectFieldsInArray(
        Array.isArray(page?.results) ? page.results : [],
        MOVIE_LIST_FIELDS
      ) as MediaGridItem[]
    })) as MediaGridPage[];
  } catch {
    return null;
  }
}

export default async function MoviesPage({ searchParams }: { searchParams?: SearchParams }) {
  const hasFilters = !!searchParams && Object.keys(searchParams).length > 0;
  const initialData = hasFilters ? null : await fetchInitialMovies();
  return <MoviesPageClient initialData={initialData} />;
}
