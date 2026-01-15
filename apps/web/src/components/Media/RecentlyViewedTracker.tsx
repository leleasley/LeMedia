"use client";

import { useTrackView } from "@/hooks/useTrackView";

interface RecentlyViewedTrackerProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath?: string | null;
}

export function RecentlyViewedTracker(props: RecentlyViewedTrackerProps) {
  useTrackView(props);
  return null;
}
