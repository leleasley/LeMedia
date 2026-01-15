import TvPageClient from "./TvPageClient";
import type { MediaGridPage, MediaGridItem } from "@/types/media-grid";
import { getPopularTv } from "@/lib/tmdb";
import { selectFieldsInArray } from "@/lib/api-optimization";

type SearchParams = Record<string, string | string[] | undefined>;

const TV_LIST_FIELDS = [
  "id",
  "name",
  "poster_path",
  "backdrop_path",
  "first_air_date",
  "vote_average",
  "vote_count",
  "popularity",
  "genre_ids",
  "overview",
] as const;

async function fetchInitialTv() {
  try {
    const pages = await Promise.all([1, 2, 3].map(page => getPopularTv(page)));
    return pages.map((page) => ({
      ...page,
      results: selectFieldsInArray(
        Array.isArray(page?.results) ? page.results : [],
        TV_LIST_FIELDS
      ) as MediaGridItem[]
    })) as MediaGridPage[];
  } catch {
    return null;
  }
}

export default async function TvPage({ searchParams }: { searchParams?: SearchParams }) {
  const hasFilters = !!searchParams && Object.keys(searchParams).length > 0;
  const initialData = hasFilters ? null : await fetchInitialTv();
  return <TvPageClient initialData={initialData} />;
}
