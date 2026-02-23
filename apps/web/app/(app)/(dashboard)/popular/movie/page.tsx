"use client";

import { MediaGrid } from "@/components/Media/MediaGrid";
import { createTmdbListFetcher } from "@/lib/tmdb-client";

export default function PopularMoviesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">Movies</h1>
        <p className="text-foreground/70">Browse popular movies</p>
      </div>
      <MediaGrid fetcher={createTmdbListFetcher("/api/tmdb/movie/popular")} type="movie" title="" showTitle={false} />
    </div>
  );
}
