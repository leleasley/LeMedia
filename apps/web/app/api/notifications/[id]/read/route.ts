import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { markNotificationAsRead, upsertUser } from "@/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return NextResponse.json(
      { error: "Failed to mark notification as read" },
      { status: 500 }
    );
  }
}
