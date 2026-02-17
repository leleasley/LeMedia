import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getUser } from "@/auth";
import { getCustomListById, getUserByUsername, listCustomListItems, upsertUser, findActiveRequestsByTmdbIds } from "@/db";
import { ListDetailPageClient } from "@/components/Lists";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { getAvailabilityStatusByTmdbIds } from "@/lib/library-availability";
import { resolveMediaStatus } from "@/lib/media-status";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ listId: string }>;
}): Promise<Metadata> {
  const { listId } = await params;
  const listIdNum = parseInt(listId, 10);

  if (isNaN(listIdNum)) {
    return { title: "List Not Found - LeMedia" };
  }

  const list = await getCustomListById(listIdNum);
  if (!list) {
    return { title: "List Not Found - LeMedia" };
  }

  return {
    title: `${list.name} - LeMedia`,
    description: list.description || `A custom list with ${list.itemCount} items`,
  };
}

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const listIdNum = parseInt(listId, 10);

  if (isNaN(listIdNum)) {
    notFound();
  }

  // Get user
  const user = await getUser().catch(() => null);
  if (!user) {
    notFound();
  }

  const dbUser = await getUserByUsername(user.username);
  const userId = dbUser?.id ?? (await upsertUser(user.username, user.groups)).id;

  // Get list
  const list = await getCustomListById(listIdNum);
  if (!list || Number(list.userId) !== userId) {
    notFound();
  }

  // Get items with TMDB data
  const items = await listCustomListItems(listIdNum);
  const imageProxyEnabled = await getImageProxyEnabled();

  // Get availability and request status
  const movieIds = items.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId);
  const tvIds = items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId);

  const [movieAvailability, tvAvailability, movieRequests, tvRequests]: [
    Record<number, any>,
    Record<number, any>,
    Array<{ tmdb_id: number; status: string }>,
    Array<{ tmdb_id: number; status: string }>
  ] = await Promise.all([
    movieIds.length ? getAvailabilityStatusByTmdbIds("movie", movieIds) : Promise.resolve({} as Record<number, any>),
    tvIds.length ? getAvailabilityStatusByTmdbIds("tv", tvIds) : Promise.resolve({} as Record<number, any>),
    movieIds.length
      ? findActiveRequestsByTmdbIds({ requestType: "movie", tmdbIds: movieIds }).catch(() => [])
      : Promise.resolve([]),
    tvIds.length
      ? findActiveRequestsByTmdbIds({ requestType: "episode", tmdbIds: tvIds }).catch(() => [])
      : Promise.resolve([])
  ]);

  const movieRequestByTmdb = new Map(movieRequests.map((req) => [req.tmdb_id, req.status]));
  const tvRequestByTmdb = new Map(tvRequests.map((req) => [req.tmdb_id, req.status]));

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
        
        const availabilityStatus = item.mediaType === "movie"
          ? movieAvailability[item.tmdbId]
          : tvAvailability[item.tmdbId];
        const requestStatus = item.mediaType === "movie"
          ? movieRequestByTmdb.get(item.tmdbId)
          : tvRequestByTmdb.get(item.tmdbId);
        const mediaStatus = resolveMediaStatus({ availabilityStatus, requestStatus });

        return {
          ...item,
          title,
          posterUrl: tmdbImageUrl((details as any).poster_path, "w500", imageProxyEnabled),
          year,
          rating: (details as any).vote_average ?? 0,
          description: (details as any).overview ?? "",
          mediaStatus,
        };
      } catch {
        return {
          ...item,
          title: "Unknown",
          posterUrl: null,
          year: "",
          rating: 0,
          description: "",
          mediaStatus: undefined,
        };
      }
    })
  );

  return (
    <ListDetailPageClient
      listId={listIdNum}
      initialList={{
        id: Number(list.id),
          name: list.name,
          description: list.description,
          isPublic: list.isPublic,
          shareId: list.shareId,
          shareSlug: list.shareSlug ?? null,
          mood: list.mood ?? null,
          occasion: list.occasion ?? null,
          itemCount: Number(list.itemCount),
          coverTmdbId: list.coverTmdbId ?? null,
          coverMediaType: list.coverMediaType ?? null,
          customCoverImagePath: list.customCoverImagePath ?? null,
          customCoverImageSize: list.customCoverImageSize ?? null,
          customCoverImageMimeType: list.customCoverImageMimeType ?? null,
          updatedAt: list.updatedAt ?? null,
        }}
      initialItems={enrichedItems}
    />
  );
}
