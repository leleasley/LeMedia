import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { syncWatchlists } from "@/lib/request-sync";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;

    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return jsonResponseWithETag(req, { error: "User not found" }, { status: 404 });

    // Only allow if at least one sync is enabled
    if (!dbUser.watchlist_sync_movies && !dbUser.watchlist_sync_tv) {
      return NextResponse.json({ error: "Watchlist sync is not enabled for this account" }, { status: 400 });
    }

    // Trigger sync
    // Note: syncWatchlists currently syncs ALL users. 
    // Optimization: We could refactor syncWatchlists to accept a userId, but for now calling it globally is safe (locks handle concurrency).
    // Given the previous implementation, it iterates all users. To make this efficient for a single user button, 
    // it ideally should only sync the current user.
    // However, the current `syncWatchlists` implementation iterates all. 
    // I will use it as is for now, but in a real high-scale app we'd want to target just this user.
    // Actually, let's modify syncWatchlists to optionally accept a userId filter in the future.
    // For this task, I'll just call the global sync. It handles its own locking.
    
    const result = await syncWatchlists();

    return NextResponse.json({ 
        success: true, 
        message: "Sync started", 
        stats: result 
    });

  } catch (error: any) {
    console.error("Manual sync failed:", error);
    return NextResponse.json({ error: error?.message ?? "Failed to sync watchlist" }, { status: 500 });
  }
}
