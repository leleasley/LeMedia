import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getUserByUsername, upsertUser } from "@/db";
import { getFriendsFeed, getPublicFeed } from "@/db-social";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "30"), 50);
    const before = url.searchParams.get("before") || undefined;
    const type = url.searchParams.get("type") || "friends"; // friends | public

    let events;

    if (type === "public") {
      events = await getPublicFeed(limit, before);
    } else {
      const { id: userId } = await resolveUserId();
      events = await getFriendsFeed(userId, limit, before);
    }

    return NextResponse.json({
      events,
      hasMore: events.length === limit,
      nextBefore: events.length > 0 ? events[events.length - 1].createdAt : null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized", events: [], hasMore: false }, { status: 401 });
    return NextResponse.json({ error: "Unable to load feed", events: [], hasMore: false }, { status: 500 });
  }
}
