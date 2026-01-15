import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { markAllNotificationsAsRead, upsertUser } from "@/db";

export async function POST() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await upsertUser(user.username, user.groups);
    await markAllNotificationsAsRead(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return NextResponse.json(
      { error: "Failed to mark all notifications as read" },
      { status: 500 }
    );
  }
}
