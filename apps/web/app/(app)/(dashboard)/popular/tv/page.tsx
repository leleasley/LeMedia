"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function PopularTvPage() {
  return <MediaGrid fetcher={createTmdbListFetcher("/api/tmdb/tv/popular")} type="tv" title="Popular TV" />;
}
