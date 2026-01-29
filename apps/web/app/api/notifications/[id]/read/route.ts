import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { markNotificationAsRead, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const { id: userId } = await upsertUser(user.username, user.groups);
  const resolvedParams = await Promise.resolve(params);
  const notificationId = parseInt(resolvedParams.id);

  if (isNaN(notificationId)) {
    return NextResponse.json({ error: "Invalid notification ID" }, { status: 400 });
  }

  const success = await markNotificationAsRead(notificationId, userId);

  if (!success) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
