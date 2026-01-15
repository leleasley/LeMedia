import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { resetDashboardSlidersForUser, upsertUser } from "@/db";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id: userId } = await upsertUser(user.username, user.groups);
  await resetDashboardSlidersForUser(userId);
  return new NextResponse(null, { status: 204 });
}

