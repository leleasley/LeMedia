"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function PopularTVPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">TV Shows</h1>
        <p className="text-foreground/70">Browse popular TV shows</p>
      </div>
      <MediaGrid fetcher={createTmdbListFetcher("/api/v1/tmdb/tv/popular")} type="tv" title="" showTitle={false} />
    </div>
  );
}
