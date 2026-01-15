"use client";

import useSWR from "swr";
import { MediaCarousel, type CarouselItem } from "@/components/Media/MediaCarousel";
import { MediaCarouselSkeleton } from "@/components/Media/MediaCarouselSkeleton";

type RecentAddedResponse = { items: CarouselItem[] };

export function RecentAddedCarouselClient({ take = 20 }: { take?: number }) {
  const { data, error, isLoading } = useSWR<RecentAddedResponse>(
    `/api/v1/library/recent?take=${take}`,
    {
      refreshInterval: 60000,
      revalidateOnFocus: true,
    }
  );

  if (!data && !error && (isLoading ?? true)) {
    return <MediaCarouselSkeleton title="Recently Added" />;
  }

  const items = data?.items ?? [];
  if (!items.length) return null;

  return <MediaCarousel title="Recently Added" items={items} />;
}
