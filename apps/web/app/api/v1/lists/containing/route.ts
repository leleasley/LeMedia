import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { getUserByUsername, upsertUser, getListsContainingMedia } from "@/db";

const QuerySchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
});

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) {
    throw new Error("Unauthorized");
  }
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

/**
 * GET /api/v1/lists/containing?tmdbId=123&mediaType=movie
 * Returns the user's lists that contain this media item
 */
export async function GET(req: NextRequest) {
  try {
    const { id: userId } = await resolveUserId();

    const tmdbId = req.nextUrl.searchParams.get("tmdbId");
    const mediaType = req.nextUrl.searchParams.get("mediaType");

    const parsed = QuerySchema.parse({ tmdbId, mediaType });

    const lists = await getListsContainingMedia(userId, parsed.tmdbId, parsed.mediaType);

    return NextResponse.json({ lists });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to load lists" }, { status: 500 });
  }
}
