import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { getRecentlyWatchedWithDetails } from "@/lib/jellyfin-watch";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const dbUser = await getUserWithHash(user.username);
  const jellyfinUserId = dbUser?.jellyfin_user_id;

  if (!jellyfinUserId) {
    return cacheableJsonResponseWithETag(req, {
      items: [],
      message: "Jellyfin not linked"
    }, { maxAge: 60 });
  }

  try {
    const items = await getRecentlyWatchedWithDetails(jellyfinUserId, 30);

    return cacheableJsonResponseWithETag(req, {
      items
    }, { maxAge: 120 }); // Cache for 2 minutes
  } catch (error) {
    console.error("[Recently Watched Timeline] Error:", error);
    return cacheableJsonResponseWithETag(req, {
      items: [],
      error: "Failed to fetch recently watched"
    }, { maxAge: 30 });
  }
}
