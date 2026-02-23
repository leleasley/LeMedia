"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function TopRatedMoviesPage() {
  return <MediaGrid fetcher={createTmdbListFetcher("/api/tmdb/movie/top-rated")} type="movie" title="Top Rated Movies" />;
}
