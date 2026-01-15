import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getUserRequestLimitStatus, getUserRequestStats, upsertUser } from "@/db";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser().catch(() => null);
    if (!user) {
      return jsonResponseWithETag(req, { error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await upsertUser(user.username, user.groups);
    const stats = await getUserRequestStats(user.username);
    let movieQuota = await getUserRequestLimitStatus(dbUser.id, "movie");
    let seriesQuota = await getUserRequestLimitStatus(dbUser.id, "episode");

    if (user.isAdmin) {
      movieQuota = { ...movieQuota, limit: 0, remaining: null, unlimited: true, used: 0 };
      seriesQuota = { ...seriesQuota, limit: 0, remaining: null, unlimited: true, used: 0 };
    }

    return cacheableJsonResponseWithETag(req, {
      stats: {
        total: stats.total,
        movies: stats.movie,
        series: stats.episode,
        pending: stats.pending,
        available: stats.available,
        failed: stats.failed,
      },
      quota: {
        movie: movieQuota,
        series: seriesQuota
      }
    }, { maxAge: 0, sMaxAge: 0, private: true });
  } catch (error: any) {
    logger.error("Error fetching profile stats:", error);
    return jsonResponseWithETag(req, 
      { error: error?.message ?? "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
