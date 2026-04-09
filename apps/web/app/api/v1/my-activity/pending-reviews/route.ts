import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getPendingReviewQueue, getUserByUsername, upsertUser } from "@/db";
import { getMovie, getTv } from "@/lib/tmdb";


async function resolveViewer() {
  const user = await getUser().catch(() => null);
  if (!user) return null;
  const dbUser = await getUserByUsername(user.username).catch(() => null);
  if (dbUser) return dbUser;
  const created = await upsertUser(user.username, user.groups).catch(() => null);
  return created ? { id: created.id } : null;
}


export async function GET(req: Request) {
  const viewer = await resolveViewer();
  if (!viewer?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 6), 1), 12);
  const queue = await getPendingReviewQueue({ userId: viewer.id, limit });

  const items = await Promise.all(
    queue.items.map(async (item) => {
      try {
        const detail = item.mediaType === "movie" ? await getMovie(item.tmdbId) : await getTv(item.tmdbId);
        const title = item.mediaType === "movie" ? detail?.title : detail?.name;
        const releaseDate = item.mediaType === "movie" ? detail?.release_date : detail?.first_air_date;
        return {
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          watchedAt: item.watchedAt,
          title: title ?? `TMDB ${item.tmdbId}`,
          posterPath: detail?.poster_path ?? null,
          releaseYear: releaseDate ? new Date(releaseDate).getFullYear() : null,
        };
      } catch {
        return {
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          watchedAt: item.watchedAt,
          title: `TMDB ${item.tmdbId}`,
          posterPath: null,
          releaseYear: null,
        };
      }
    })
  );

  return NextResponse.json({
    count: queue.count,
    items,
  });
}