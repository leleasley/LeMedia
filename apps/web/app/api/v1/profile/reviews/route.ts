import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserByUsername, upsertUser, getRecentReviewsByUser } from "@/db";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 6), 1), 12);

  const existingUser = await getUserByUsername(user.username);
  const dbUser = existingUser ?? await upsertUser(user.username, user.groups);
  const reviews = await getRecentReviewsByUser(dbUser.id, limit);

  return NextResponse.json({ reviews });
}