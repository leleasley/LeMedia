"use client";

import useSWR from "swr";
import { MediaCarousel } from "@/components/Media/MediaCarousel";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

type RecentlyViewedItem = {
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  lastViewedAt: string;
  description?: string;
  rating?: number;
  year?: string;
};

export function RecentlyViewedCarousel({ imageProxyEnabled }: { imageProxyEnabled: boolean }) {
  const { data, error } = useSWR<{ items: RecentlyViewedItem[] }>("/api/recently-viewed?limit=20", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  });

  if (error || !data || data.items.length === 0) {
    return null;
  }

  const items = data.items.map((item) => ({
    id: item.tmdbId,
    title: item.title,
    posterUrl: item.posterPath,
    year: item.year || "",
    rating: item.rating || 0,
    description: item.description || "",
    type: item.mediaType,
  }));

  return (
    <MediaCarousel 
      title="Recently Viewed"
      items={items}
      cardMode="requestable"
    />
  );
}
