import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { listNotificationEndpointsFull, listUserNotificationEndpointIds, upsertUser } from "@/db";

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const dbUser = await upsertUser(user.username, user.groups);

  const [allEndpoints, subscribedIds] = await Promise.all([
    listNotificationEndpointsFull(),
    listUserNotificationEndpointIds(dbUser.id),
  ]);

  // Only show global (admin-managed) enabled endpoints
  const subscribedSet = new Set(subscribedIds);
  const globalEndpoints = allEndpoints
    .filter((ep) => ep.is_global && ep.owner_user_id == null && ep.enabled)
    .map((ep) => ({
      id: ep.id,
      name: ep.name,
      type: ep.type,
      subscribed: subscribedSet.has(ep.id),
    }));

  return NextResponse.json({ endpoints: globalEndpoints });
}
