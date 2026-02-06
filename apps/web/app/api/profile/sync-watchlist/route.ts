import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { syncWatchlists } from "@/lib/request-sync";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { requireCsrf } from "@/lib/csrf";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return jsonResponseWithETag(req, { error: "User not found" }, { status: 404 });

    // Only allow if at least one sync is enabled
    if (!dbUser.watchlist_sync_movies && !dbUser.watchlist_sync_tv) {
      return NextResponse.json({ error: "Watchlist sync is not enabled for this account" }, { status: 400 });
    }

    // Trigger sync for the current user only
    const result = await syncWatchlists({ userId: dbUser.id });

    return NextResponse.json({ 
        success: true,
        message: "Sync started",
        stats: {
          added: result.createdCount,
          skipped: 0,
          failed: result.errors
        }
    });

  } catch (error: any) {
    console.error("Manual sync failed:", error);
    return NextResponse.json({ error: error?.message ?? "Failed to sync watchlist" }, { status: 500 });
  }
}
