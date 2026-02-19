import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { logger } from "@/lib/logger";
import { requireCsrf } from "@/lib/csrf";
import { getUserByUsername, upsertUser } from "@/db";
import { blockUser, unblockUser, getBlockedUsers, createReport, checkRateLimit, recordRateLimitAction } from "@/db-social";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username, isAdmin: user.isAdmin };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username, isAdmin: user.isAdmin };
}

const BlockSchema = z.object({
  action: z.enum(["block", "unblock"]),
  targetUserId: z.number(),
  reason: z.string().max(500).optional(),
});

const ReportSchema = z.object({
  reportedUserId: z.number().optional(),
  reportedListId: z.number().optional(),
  reportedCommentId: z.number().optional(),
  reason: z.enum(["spam", "harassment", "inappropriate", "other"]),
  description: z.string().max(1000).optional(),
});

// GET /api/v1/social/blocks - get blocked users
export async function GET(req: NextRequest) {
  try {
    const { id: userId } = await resolveUserId();
    const blocked = await getBlockedUsers(userId);
    return NextResponse.json({ blocked });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to load blocked users" }, { status: 500 });
  }
}

// POST /api/v1/social/blocks - block/unblock/report
export async function POST(req: NextRequest) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();

    // Check if this is a report or block action
    if (body.reason && !body.action) {
      // Report
      const parsed = ReportSchema.parse(body);

      // Rate limit: 10 reports per hour
      const allowed = await checkRateLimit(userId, "report", 10, 60);
      if (!allowed) {
        return NextResponse.json({ error: "Too many reports. Please try again later." }, { status: 429 });
      }

      const report = await createReport(userId, parsed);
      await recordRateLimitAction(userId, "report");
      return NextResponse.json({ report }, { status: 201 });
    }

    // Block/unblock
    const parsed = BlockSchema.parse(body);

    if (parsed.action === "block") {
      await blockUser(userId, parsed.targetUserId, parsed.reason);
      return NextResponse.json({ blocked: true });
    } else {
      await unblockUser(userId, parsed.targetUserId);
      return NextResponse.json({ blocked: false });
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof z.ZodError) {
      logger.warn("[social/blocks] Invalid request payload", { issues: err.issues });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to process action" }, { status: 500 });
  }
}
