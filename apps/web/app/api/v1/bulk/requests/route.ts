import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import {
  createBulkRequests,
  getUserByUsername,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { getMovie, getTv } from "@/lib/tmdb";

const BulkRequestSchema = z.object({
  items: z.array(
    z.object({
      tmdbId: z.number().int().positive(),
      mediaType: z.enum(["movie", "tv"]),
    })
  ).min(1).max(50),
});

async function resolveUser() {
  const user = await getUser().catch(() => null);
  if (!user) {
    throw new Error("Unauthorized");
  }
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

export async function POST(req: NextRequest) {
  try {
    const userInfo = await resolveUser();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const parsed = BulkRequestSchema.parse(body);

    // Fetch TMDB details for each item
    const itemsWithDetails = await Promise.all(
      parsed.items.map(async (item) => {
        try {
          if (item.mediaType === "movie") {
            const movie = await getMovie(item.tmdbId);
            return {
              requestType: "movie" as const,
              tmdbId: item.tmdbId,
              title: movie.title ?? "Untitled",
              posterPath: movie.poster_path,
              backdropPath: movie.backdrop_path,
              releaseYear: movie.release_date
                ? parseInt(movie.release_date.slice(0, 4), 10)
                : undefined,
            };
          } else {
            const tv = await getTv(item.tmdbId);
            return {
              requestType: "episode" as const,
              tmdbId: item.tmdbId,
              title: tv.name ?? "Untitled",
              posterPath: tv.poster_path,
              backdropPath: tv.backdrop_path,
              releaseYear: tv.first_air_date
                ? parseInt(tv.first_air_date.slice(0, 4), 10)
                : undefined,
            };
          }
        } catch {
          return null;
        }
      })
    );

    const validItems = itemsWithDetails.filter(Boolean) as NonNullable<
      (typeof itemsWithDetails)[number]
    >[];

    if (validItems.length === 0) {
      return NextResponse.json(
        { error: "No valid items to request" },
        { status: 400 }
      );
    }

    const result = await createBulkRequests({
      userId: userInfo.id,
      username: userInfo.username,
      items: validItems,
    });

    return NextResponse.json({
      created: result.created,
      skipped: result.skipped,
      requestIds: result.requestIds,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: err.issues },
        { status: 400 }
      );
    }
    console.error("Bulk request error:", err);
    return NextResponse.json(
      { error: "Unable to create requests" },
      { status: 500 }
    );
  }
}
