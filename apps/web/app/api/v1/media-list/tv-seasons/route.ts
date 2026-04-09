import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { getUserByUsername, getUserTvWatchedSeasons, replaceUserTvWatchedSeasons, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const QuerySchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
});

const BodySchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
  seasonNumbers: z.array(z.coerce.number().int().positive()).max(100),
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

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId();
    const parsed = QuerySchema.parse({
      tmdbId: req.nextUrl.searchParams.get("tmdbId"),
    });

    const seasonItems = await getUserTvWatchedSeasons({
      userId,
      tmdbId: parsed.tmdbId,
    });

    return NextResponse.json({
      seasonNumbers: seasonItems.map((item) => item.seasonNumber),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to load watched seasons" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = BodySchema.parse(await req.json());
    const seasonNumbers = await replaceUserTvWatchedSeasons({
      userId,
      tmdbId: body.tmdbId,
      seasonNumbers: body.seasonNumbers,
    });

    return NextResponse.json({ ok: true, seasonNumbers });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save watched seasons" }, { status: 500 });
  }
}
