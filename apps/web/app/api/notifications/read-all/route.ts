import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { markAllNotificationsAsRead, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id: userId } = await upsertUser(user.username, user.groups);
  await markAllNotificationsAsRead(userId);

  return NextResponse.json({ success: true });
}
