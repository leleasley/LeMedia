import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { addUserMediaListItem, getUserByUsername, getUserMediaListStatus, listUserMediaList, removeUserMediaListItem, upsertUser } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";
import { requireCsrf } from "@/lib/csrf";

const ListTypeSchema = z.enum(["favorite", "watchlist"]);
const MediaTypeSchema = z.enum(["movie", "tv"]);

const BodySchema = z.object({
  listType: ListTypeSchema,
  mediaType: MediaTypeSchema,
  tmdbId: z.coerce.number().int().positive()
});

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) {
    throw new Error("Unauthorized");
  }
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return dbUser.id;
  const created = await upsertUser(user.username, user.groups);
  return created.id;
}

export async function handleMediaListGet(req: NextRequest, listTypeOverride?: "favorite" | "watchlist") {
  try {
    const userId = await resolveUserId();
    const searchParams = req.nextUrl.searchParams;
    const tmdbIdRaw = searchParams.get("tmdbId");
    const mediaTypeRaw = searchParams.get("mediaType");
    const listTypeRaw = searchParams.get("listType");
    const takeRaw = searchParams.get("take");

    if (tmdbIdRaw && mediaTypeRaw) {
      const tmdbId = z.coerce.number().int().positive().parse(tmdbIdRaw);
      const mediaType = MediaTypeSchema.parse(mediaTypeRaw);
      const status = await getUserMediaListStatus({ userId, mediaType, tmdbId });
      return cacheableJsonResponseWithETag(req, status, { maxAge: 0, sMaxAge: 0, private: true });
    }

    const listType = ListTypeSchema.parse(listTypeOverride ?? listTypeRaw ?? "");
    const take = Math.min(Math.max(Number(takeRaw ?? 20), 1), 50);
    const imageProxyEnabled = await getImageProxyEnabled();
    const list = await listUserMediaList({ userId, listType, limit: take });
    const items = (await Promise.all(
      list.map(async item => {
        const details = item.media_type === "movie"
          ? await getMovie(item.tmdb_id).catch(() => null)
          : await getTv(item.tmdb_id).catch(() => null);
        if (!details) return null;
        const title = item.media_type === "movie" ? details.title ?? "Untitled" : details.name ?? "Untitled";
        const year = item.media_type === "movie"
          ? (details.release_date ?? "").slice(0, 4)
          : (details.first_air_date ?? "").slice(0, 4);
        return {
          id: item.tmdb_id,
          title,
          posterUrl: tmdbImageUrl(details.poster_path, "w500", imageProxyEnabled),
          year,
          rating: details.vote_average ?? 0,
          description: details.overview ?? "",
          type: item.media_type as "movie" | "tv"
        };
      })
    )).filter(Boolean);

    return cacheableJsonResponseWithETag(req, { items }, { maxAge: 15, sMaxAge: 0, private: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return jsonResponseWithETag(req, { error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return jsonResponseWithETag(req, { error: "Invalid request" }, { status: 400 });
    }
    return jsonResponseWithETag(req, { error: "Unable to load list" }, { status: 500 });
  }
}

export async function handleMediaListPost(req: NextRequest, listTypeOverride?: "favorite" | "watchlist") {
  try {
    const userId = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const bodyRaw = await req.json();
    const body = BodySchema.parse({
      ...bodyRaw,
      listType: listTypeOverride ?? bodyRaw?.listType
    });
    await addUserMediaListItem({
      userId,
      listType: body.listType,
      mediaType: body.mediaType,
      tmdbId: body.tmdbId
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to add item" }, { status: 500 });
  }
}

export async function handleMediaListDelete(req: NextRequest, listTypeOverride?: "favorite" | "watchlist") {
  try {
    const userId = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const bodyRaw = await req.json();
    const body = BodySchema.parse({
      ...bodyRaw,
      listType: listTypeOverride ?? bodyRaw?.listType
    });
    await removeUserMediaListItem({
      userId,
      listType: body.listType,
      mediaType: body.mediaType,
      tmdbId: body.tmdbId
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to remove item" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleMediaListGet(req);
}

export async function POST(req: NextRequest) {
  return handleMediaListPost(req);
}

export async function DELETE(req: NextRequest) {
  return handleMediaListDelete(req);
}
