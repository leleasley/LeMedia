import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { extractExternalApiKey, getExternalApiAuth } from "@/lib/external-api";
import {
  getUserByUsername,
  upsertUser,
  listFollowedMediaForUser,
  upsertFollowedMedia,
  removeFollowedMediaById,
  removeFollowedMediaByTmdb,
  updateFollowedMediaOptions,
} from "@/db";
import { getMovie, getMovieReleaseDates, getTv } from "@/lib/tmdb";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const MediaTypeSchema = z.enum(["movie", "tv"]);

const CreateFollowSchema = z.object({
  mediaType: MediaTypeSchema,
  tmdbId: z.coerce.number().int().positive(),
  notifyOnTheatrical: z.boolean().optional(),
  notifyOnDigital: z.boolean().optional(),
});

const UpdateFollowSchema = z.object({
  id: z.string().uuid(),
  notifyOnTheatrical: z.boolean().optional(),
  notifyOnDigital: z.boolean().optional(),
});

const DeleteFollowSchema = z.object({
  id: z.string().uuid().optional(),
  mediaType: MediaTypeSchema.optional(),
  tmdbId: z.coerce.number().int().positive().optional(),
}).refine((v) => Boolean(v.id) || (Boolean(v.mediaType) && Boolean(v.tmdbId)), {
  message: "Provide either id or mediaType+tmdbId",
});

async function resolveAuthUser(req: NextRequest): Promise<{ userId: number | null; tokenAuth: boolean }> {
  const apiKey = extractExternalApiKey(req);
  if (apiKey) {
    const auth = await getExternalApiAuth(apiKey);
    if (auth.ok && auth.userId) {
      return { userId: auth.userId, tokenAuth: true };
    }
  }

  const user = await getUser().catch(() => null);
  if (!user) return { userId: null, tokenAuth: false };
  const dbUser = await getUserByUsername(user.username).catch(() => null);
  if (dbUser) return { userId: dbUser.id, tokenAuth: false };
  const created = await upsertUser(user.username, user.groups).catch(() => null);
  return { userId: created?.id ?? null, tokenAuth: false };
}

function normalizeDate(input?: string | null) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const datePart = trimmed.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return datePart;
}

function getDigitalReleaseDate(releaseDates: any, region = (process.env.TMDB_REGION || "GB")) {
  if (!releaseDates?.results || !Array.isArray(releaseDates.results)) return null;
  for (const country of releaseDates.results) {
    if (country?.iso_3166_1 !== region && country?.iso_3166_1 !== "US") continue;
    const digitalRelease = country?.release_dates?.find((rd: any) => Number(rd?.type) === 4);
    if (digitalRelease?.release_date) return normalizeDate(String(digitalRelease.release_date));
  }
  return null;
}

function isPastOrToday(dateStr: string | null) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr <= today;
}

export async function GET(req: NextRequest) {
  const { userId } = await resolveAuthUser(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await listFollowedMediaForUser(userId);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { userId, tokenAuth } = await resolveAuthUser(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!tokenAuth) {
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
  }

  try {
    const body = CreateFollowSchema.parse(await req.json());

    if (body.mediaType === "movie") {
      const [movie, releaseDates] = await Promise.all([
        getMovie(body.tmdbId),
        getMovieReleaseDates(body.tmdbId).catch(() => null),
      ]);

      const title = String(movie?.title ?? "Untitled");
      const posterPath = movie?.poster_path ? String(movie.poster_path) : null;
      const theatricalReleaseDate = normalizeDate(movie?.release_date ?? null);
      const digitalReleaseDate = getDigitalReleaseDate(releaseDates);

      const requestedTheatrical = body.notifyOnTheatrical ?? true;
      const requestedDigital = body.notifyOnDigital ?? true;

      const item = await upsertFollowedMedia({
        userId,
        mediaType: "movie",
        tmdbId: body.tmdbId,
        title,
        posterPath,
        theatricalReleaseDate,
        digitalReleaseDate,
        notifyOnTheatrical: requestedTheatrical && !isPastOrToday(theatricalReleaseDate),
        notifyOnDigital: requestedDigital && !isPastOrToday(digitalReleaseDate),
      });

      return NextResponse.json({ ok: true, item });
    }

    const tv = await getTv(body.tmdbId);
    const title = String(tv?.name ?? "Untitled");
    const posterPath = tv?.poster_path ? String(tv.poster_path) : null;
    const premiereDate = normalizeDate(tv?.first_air_date ?? null);
    const requestedTheatrical = body.notifyOnTheatrical ?? true;

    const item = await upsertFollowedMedia({
      userId,
      mediaType: "tv",
      tmdbId: body.tmdbId,
      title,
      posterPath,
      theatricalReleaseDate: premiereDate,
      digitalReleaseDate: null,
      notifyOnTheatrical: requestedTheatrical && !isPastOrToday(premiereDate),
      notifyOnDigital: false,
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }
    logger.error("[Following] POST failed", error);
    return NextResponse.json({ error: "Failed to follow media" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId, tokenAuth } = await resolveAuthUser(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!tokenAuth) {
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
  }

  try {
    const body = UpdateFollowSchema.parse(await req.json());
    const item = await updateFollowedMediaOptions(userId, body.id, {
      notifyOnTheatrical: body.notifyOnTheatrical,
      notifyOnDigital: body.notifyOnDigital,
    });
    if (!item) {
      return NextResponse.json({ error: "Followed item not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }
    logger.error("[Following] PATCH failed", error);
    return NextResponse.json({ error: "Failed to update followed media" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId, tokenAuth } = await resolveAuthUser(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!tokenAuth) {
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
  }

  try {
    const body = DeleteFollowSchema.parse(await req.json());
    const removed = body.id
      ? await removeFollowedMediaById(userId, body.id)
      : await removeFollowedMediaByTmdb(userId, body.mediaType!, body.tmdbId!);

    if (!removed) {
      return NextResponse.json({ error: "Followed item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }
    logger.error("[Following] DELETE failed", error);
    return NextResponse.json({ error: "Failed to unfollow media" }, { status: 500 });
  }
}
