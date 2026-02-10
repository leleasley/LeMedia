import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { getThisMonthStats } from "@/lib/jellyfin-watch";
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
      moviesThisMonth: 0,
      episodesThisMonth: 0,
      hoursThisMonth: 0,
      moviesLastMonth: 0,
      episodesLastMonth: 0,
      hoursLastMonth: 0,
      message: "Jellyfin not linked"
    }, { maxAge: 60 });
  }

  try {
    const stats = await getThisMonthStats(jellyfinUserId);

    return cacheableJsonResponseWithETag(req, stats, { maxAge: 300 }); // Cache for 5 minutes
  } catch (error) {
    logger.error("[This Month Stats] Error", error);
    return cacheableJsonResponseWithETag(req, {
      moviesThisMonth: 0,
      episodesThisMonth: 0,
      hoursThisMonth: 0,
      moviesLastMonth: 0,
      episodesLastMonth: 0,
      hoursLastMonth: 0,
      error: "Failed to fetch this month stats"
    }, { maxAge: 30 });
  }
}
