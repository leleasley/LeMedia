"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function NowPlayingMoviesPage() {
  return <MediaGrid fetcher={createTmdbListFetcher("/api/v1/tmdb/movie/now-playing")} type="movie" title="Now Playing Movies" />;
}
