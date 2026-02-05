import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { getSeriesWatchHistory } from "@/lib/jellyfin-watch";
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
    const history = await getSeriesWatchHistory(jellyfinUserId);

    return cacheableJsonResponseWithETag(req, {
      items: history
    }, { maxAge: 120 });
  } catch (error) {
    console.error("[Series Watch History] Error:", error);
    return cacheableJsonResponseWithETag(req, {
      items: [],
      error: "Failed to fetch series history"
    }, { maxAge: 30 });
  }
}
