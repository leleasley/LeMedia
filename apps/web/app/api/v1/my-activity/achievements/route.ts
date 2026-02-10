import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { getAchievementLevel } from "@/lib/jellyfin-watch";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const dbUser = await getUserWithHash(user.username);
  const jellyfinUserId = dbUser?.jellyfin_user_id;

  if (!jellyfinUserId) {
    return cacheableJsonResponseWithETag(req, {
      hoursThisWeek: 0,
      level: "casual",
      nextMilestone: 10,
      progress: 0,
      message: "Jellyfin not linked"
    }, { maxAge: 60 });
  }

  try {
    const achievement = await getAchievementLevel(jellyfinUserId);

    return cacheableJsonResponseWithETag(req, achievement, { maxAge: 300 }); // Cache for 5 minutes
  } catch (error) {
    logger.error("[Achievement Level] Error", error);
    return cacheableJsonResponseWithETag(req, {
      hoursThisWeek: 0,
      level: "casual",
      nextMilestone: 10,
      progress: 0,
      error: "Failed to fetch achievement level"
    }, { maxAge: 30 });
  }
}
