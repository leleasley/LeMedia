"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function UpcomingMoviesPage() {
  return <MediaGrid fetcher={createTmdbListFetcher("/api/tmdb/movie/upcoming")} type="movie" title="Upcoming Movies" />;
}
