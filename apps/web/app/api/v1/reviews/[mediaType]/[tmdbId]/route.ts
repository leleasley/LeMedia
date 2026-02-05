import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getReviewStatsForMedia, getReviewsForMedia, getUserReviewForMedia, upsertUser } from "@/db";

const Params = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int().positive(),
});

type ParamsInput = { mediaType: string; tmdbId: string } | Promise<{ mediaType: string; tmdbId: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ mediaType: string; tmdbId: string }>);
  return params as { mediaType: string; tmdbId: string };
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const parsed = Params.parse(await resolveParams(params));
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 100);

  const dbUser = await upsertUser(user.username, user.groups);
  const [reviews, stats, userReview] = await Promise.all([
    getReviewsForMedia(parsed.mediaType, parsed.tmdbId, limit),
    getReviewStatsForMedia(parsed.mediaType, parsed.tmdbId),
    getUserReviewForMedia(dbUser.id, parsed.mediaType, parsed.tmdbId),
  ]);

  return NextResponse.json({
    stats,
    reviews,
    userReview,
  });
}
