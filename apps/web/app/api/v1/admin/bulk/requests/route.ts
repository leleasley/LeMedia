import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { bulkUpdateRequestStatus, getUserByUsername } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const BulkApproveSchema = z.object({
  requestIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["approve", "deny"]),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;

    if (!user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const parsed = BulkApproveSchema.parse(body);

    // Get admin user ID
    const dbUser = await getUserByUsername(user.username);
    const adminUserId = dbUser?.id;

    let updated = 0;
    if (parsed.action === "approve") {
      // For bulk approve, we set status to "pending" which will be picked up by the request sync
      // In a production system, this would trigger the actual Sonarr/Radarr additions
      updated = await bulkUpdateRequestStatus(
        parsed.requestIds,
        "submitted",
        "Bulk approved by admin"
      );
    } else {
      updated = await bulkUpdateRequestStatus(
        parsed.requestIds,
        "denied",
        parsed.reason || "Bulk denied by admin",
        adminUserId
      );
    }

    return NextResponse.json({
      action: parsed.action,
      updated,
      total: parsed.requestIds.length,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: err.issues },
        { status: 400 }
      );
    }
    console.error("Admin bulk request error:", err);
    return NextResponse.json(
      { error: "Unable to process bulk action" },
      { status: 500 }
    );
  }
}
