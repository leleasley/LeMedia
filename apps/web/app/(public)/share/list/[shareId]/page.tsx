import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getCustomListByShareId, listCustomListItems } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { SharedListPageClient } from "./SharedListPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const list = await getCustomListByShareId(shareId);

  if (!list) {
    return { title: "List Not Found - LeMedia" };
  }

  return {
    title: `${list.name} - LeMedia`,
    description: list.description || `A shared list with ${list.itemCount} items`,
  };
}

export default async function SharedListPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const list = await getCustomListByShareId(shareId);

  if (!list) {
    notFound();
  }

  // Get items with TMDB data
  const items = await listCustomListItems(list.id);
  const imageProxyEnabled = await getImageProxyEnabled();

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      try {
        const details =
          item.mediaType === "movie"
            ? await getMovie(item.tmdbId)
            : await getTv(item.tmdbId);
        const title =
          item.mediaType === "movie"
            ? (details as any).title
            : (details as any).name;
        const year =
          item.mediaType === "movie"
            ? ((details as any).release_date ?? "").slice(0, 4)
            : ((details as any).first_air_date ?? "").slice(0, 4);
        return {
          ...item,
          title,
          posterUrl: tmdbImageUrl((details as any).poster_path, "w500", imageProxyEnabled),
          year,
          rating: (details as any).vote_average ?? 0,
          description: (details as any).overview ?? "",
        };
      } catch {
        return {
          ...item,
          title: "Unknown",
          posterUrl: null,
          year: "",
          rating: 0,
          description: "",
        };
      }
    })
  );

  return (
    <SharedListPageClient
      list={{
        id: Number(list.id),
        name: list.name,
        description: list.description,
        itemCount: list.itemCount,
        createdAt: list.createdAt,
        coverTmdbId: list.coverTmdbId ?? null,
        coverMediaType: list.coverMediaType ?? null,
        customCoverImagePath: list.customCoverImagePath ?? null,
        updatedAt: list.updatedAt ?? null,
        mood: list.mood ?? null,
        occasion: list.occasion ?? null,
      }}
      items={enrichedItems}
    />
  );
}
