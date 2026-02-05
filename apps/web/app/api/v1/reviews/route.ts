import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getRecentReviews, upsertUser, upsertUserReview } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const ReviewBody = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().max(4000).optional().nullable(),
  spoiler: z.boolean().optional().default(false),
  title: z.string().trim().min(1).max(300),
  posterPath: z.string().trim().max(300).optional().nullable(),
  releaseYear: z.number().int().min(1800).max(2100).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 50);

  const reviews = await getRecentReviews(limit);
  return NextResponse.json({ reviews });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const body = ReviewBody.parse(await req.json());
  const dbUser = await upsertUser(user.username, user.groups);

  const result = await upsertUserReview({
    userId: dbUser.id,
    mediaType: body.mediaType,
    tmdbId: body.tmdbId,
    rating: body.rating,
    reviewText: body.reviewText ?? null,
    spoiler: body.spoiler ?? false,
    title: body.title,
    posterPath: body.posterPath ?? null,
    releaseYear: body.releaseYear ?? null,
  });

  return NextResponse.json({ review: result });
}
