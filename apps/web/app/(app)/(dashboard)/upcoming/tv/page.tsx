"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function UpcomingTvPage() {
    return <MediaGrid fetcher={createTmdbListFetcher("/api/tmdb/tv/upcoming")} type="tv" title="Upcoming TV Shows" />;
}
