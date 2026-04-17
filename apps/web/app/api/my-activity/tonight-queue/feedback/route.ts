import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  getUserWithHash,
  incrementTonightQueueRefreshSeed,
  saveTonightQueueLike,
  saveTonightQueueSkipForDate,
  updateTonightQueuePreferences,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { getAppTimezone, getIsoDateInTimeZone } from "@/lib/app-timezone";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("more_like_this"),
    mediaType: z.enum(["movie", "tv"]),
    tmdbId: z.number().int().positive(),
    genreIds: z.array(z.number().int().positive()).optional(),
  }),
  z.object({
    action: z.literal("not_tonight"),
    mediaType: z.enum(["movie", "tv"]),
    tmdbId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("hide_horror"),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("surprise_me_again"),
  }),
  z.object({
    action: z.literal("set_mood"),
    mood: z.enum(["comfort", "focused", "wildcard"]),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    if (body.action === "more_like_this") {
      await saveTonightQueueLike({
        userId: dbUser.id,
        mediaType: body.mediaType,
        tmdbId: body.tmdbId,
        genreIds: body.genreIds,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "not_tonight") {
      const timeZone = await getAppTimezone();
      const isoDate = getIsoDateInTimeZone(Date.now(), timeZone);
      await saveTonightQueueSkipForDate({
        userId: dbUser.id,
        mediaType: body.mediaType,
        tmdbId: body.tmdbId,
        isoDate,
      });
      return NextResponse.json({ ok: true, skippedFor: isoDate });
    }

    if (body.action === "hide_horror") {
      const preferences = await updateTonightQueuePreferences({ userId: dbUser.id, hideHorror: body.enabled });
      return NextResponse.json({ ok: true, preferences });
    }

    if (body.action === "set_mood") {
      const preferences = await updateTonightQueuePreferences({ userId: dbUser.id, mood: body.mood });
      return NextResponse.json({ ok: true, preferences });
    }

    const preferences = await incrementTonightQueueRefreshSeed(dbUser.id);
    return NextResponse.json({ ok: true, preferences });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid feedback request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update tonight queue" }, { status: 500 });
  }
}