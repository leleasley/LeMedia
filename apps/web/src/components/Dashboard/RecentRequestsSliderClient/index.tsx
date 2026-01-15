"use client";

import useSWR from "swr";
import { RecentRequestsSlider } from "@/components/Dashboard/RecentRequestsSlider";

type RecentRequestItem = {
  id: string;
  tmdbId: number;
  title: string;
  year?: string;
  poster: string | null;
  backdrop: string | null;
  type: "movie" | "tv";
  status: string;
  username: string;
  avatarUrl?: string | null;
};

export function RecentRequestsSliderClient({
  initialItems = [],
  take = 12
}: {
  initialItems?: RecentRequestItem[];
  take?: number;
}) {
  const { data, error, isLoading } = useSWR<{ items: RecentRequestItem[] }>(
    `/api/v1/requests/recent?take=${take}`,
    {
      refreshInterval: 20000,
      fallbackData: initialItems.length ? { items: initialItems } : undefined,
      revalidateOnFocus: true,
    }
  );

  const items = data?.items ?? initialItems;
  const showLoading = isLoading ?? (!data && !error);

  return (
    <RecentRequestsSlider items={items} isLoading={showLoading} />
  );
}
