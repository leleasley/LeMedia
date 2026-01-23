"use client";

import { useEffect, useRef } from "react";
import { csrfFetch } from "@/lib/csrf-client";

export function useTrackView(params: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath?: string | null;
}) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    
    const trackView = async () => {
      try {
        await csrfFetch("/api/recently-viewed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mediaType: params.mediaType,
            tmdbId: params.tmdbId,
            title: params.title,
            posterPath: params.posterPath ?? null,
          }),
        });
        tracked.current = true;
      } catch (error) {
        console.error("Failed to track view:", error);
      }
    };

    // Track after a 2-second delay to avoid tracking quick bounces
    const timer = setTimeout(trackView, 2000);
    return () => clearTimeout(timer);
  }, [params.mediaType, params.tmdbId, params.title, params.posterPath]);
}
