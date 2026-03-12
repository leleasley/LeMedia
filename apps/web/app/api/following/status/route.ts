import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { extractExternalApiKey, getExternalApiAuth } from "@/lib/external-api";
import { getFollowedMediaByTmdb, getUserByUsername, upsertUser } from "@/db";

const QuerySchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int().positive(),
});

async function resolveUserId(req: NextRequest) {
  const apiKey = extractExternalApiKey(req);
  if (apiKey) {
    const auth = await getExternalApiAuth(apiKey);
    if (auth.ok && auth.userId) return auth.userId;
  }

  const user = await getUser().catch(() => null);
  if (!user) return null;
  const dbUser = await getUserByUsername(user.username).catch(() => null);
  if (dbUser) return dbUser.id;
  const created = await upsertUser(user.username, user.groups).catch(() => null);
  return created?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = QuerySchema.safeParse({
    mediaType: req.nextUrl.searchParams.get("mediaType"),
    tmdbId: req.nextUrl.searchParams.get("tmdbId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const item = await getFollowedMediaByTmdb(userId, parsed.data.mediaType, parsed.data.tmdbId);
  return NextResponse.json({ followed: Boolean(item), item: item ?? null });
}
