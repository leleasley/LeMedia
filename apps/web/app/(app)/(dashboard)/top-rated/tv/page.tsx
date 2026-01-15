"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function TopRatedTvPage() {
  return <MediaGrid fetcher={createTmdbListFetcher("/api/v1/tmdb/tv/top-rated")} type="tv" title="Top Rated TV" />;
}
