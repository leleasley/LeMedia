"use client";

import useSWR from "swr";
import { ContinueWatchingCarousel } from "@/components/Dashboard/ContinueWatchingCarousel";
import { MediaCarouselSkeleton } from "@/components/Media/MediaCarouselSkeleton";

type ContinueItem = {
  id: string;
  title: string;
  posterUrl: string | null;
  playUrl: string;
  progress: number;
  type: "movie" | "tv";
};

export function ContinueWatchingCarouselClient({ take = 12 }: { take?: number }) {
  const { data, error, isLoading } = useSWR<{ items: ContinueItem[] }>(
    `/api/v1/library/continue-watching?take=${take}`,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  );

  if (!data && !error && (isLoading ?? true)) {
    return <MediaCarouselSkeleton title="Continue Watching" />;
  }

  const items = data?.items ?? [];
  if (!items.length) return null;

  return <ContinueWatchingCarousel items={items} />;
}
