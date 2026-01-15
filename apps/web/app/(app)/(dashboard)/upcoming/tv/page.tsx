"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function UpcomingTvPage() {
    return <MediaGrid fetcher={createTmdbListFetcher("/api/v1/tmdb/tv/upcoming")} type="tv" title="Upcoming TV Shows" />;
}
