"use client";

import useSWR from "swr";
import { MediaCarousel, type CarouselItem } from "@/components/Media/MediaCarousel";
import { MediaCarouselSkeleton } from "@/components/Media/MediaCarouselSkeleton";

type ListResponse = { items: CarouselItem[] };

export function MediaListCarouselClient({
  listType,
  title,
  take = 20,
}: {
  listType: "favorite" | "watchlist";
  title: string;
  take?: number;
}) {
  const { data, error, isLoading } = useSWR<ListResponse>(
    `/api/v1/media-list?listType=${listType}&take=${take}`,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  );

  if (!data && !error && (isLoading ?? true)) {
    return <MediaCarouselSkeleton title={title} />;
  }

  const items = data?.items ?? [];
  if (!items.length) return null;

  return <MediaCarousel title={title} items={items} cardMode="requestable" />;
}
