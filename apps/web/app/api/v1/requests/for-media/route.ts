import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { findActiveRequestByTmdb } from "@/db";

const Query = z.object({
  tmdbId: z.coerce.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
});

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const parsed = Query.safeParse({
    tmdbId: searchParams.get("tmdbId"),
    mediaType: searchParams.get("mediaType"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query params" }, { status: 400 });
  }

  const { tmdbId, mediaType } = parsed.data;
  const requestType = mediaType === "movie" ? "movie" : "episode";

  const request = await findActiveRequestByTmdb({ requestType, tmdbId });

  if (!request) {
    return NextResponse.json({ requestId: null });
  }

  return NextResponse.json({ requestId: request.id, status: request.status });
}
