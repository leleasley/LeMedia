import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getUnreadNotifications, getUnreadNotificationCount, upsertUser } from "@/db";

export async function GET(req: NextRequest) {
  try {
    console.log("[API] Fetching unread notifications...");
    const user = await getUser();
    console.log("[API] User authenticated:", user.username);
    
    const { id: userId } = await upsertUser(user.username, user.groups);
    console.log("[API] User upserted, ID:", userId);
    
    const notifications = await getUnreadNotifications(userId);
    const unreadCount = await getUnreadNotificationCount(userId);
    console.log("[API] Notifications fetched, count:", unreadCount);

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
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[API] Unread notifications error:", error);
    // Include more context in the error response if in development
    return NextResponse.json({ 
      error: error.message || "Internal Server Error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    }, { status: 500 });
  }
}
