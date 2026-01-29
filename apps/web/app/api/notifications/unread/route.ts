import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUnreadNotifications, getUnreadNotificationCount, upsertUser } from "@/db";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id: userId } = await upsertUser(user.username, user.groups);
  const notifications = await getUnreadNotifications(userId);
  const unreadCount = await getUnreadNotificationCount(userId);

  return NextResponse.json({
    notifications: notifications.map(n => ({
      id: n.id,
      type: n.type,
      message: n.message,
      title: n.title,
      link: n.link,
      createdAt: n.createdAt,
      isRead: n.isRead,
      metadata: n.metadata || {}
    })),
    unreadCount
  });
}
