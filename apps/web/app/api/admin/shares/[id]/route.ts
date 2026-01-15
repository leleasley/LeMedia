import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { deleteMediaShareByAdmin } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = await params;
  const shareId = parseInt(id, 10);

  if (isNaN(shareId)) {
    return NextResponse.json({ error: "Invalid share ID" }, { status: 400 });
  }

  const deleted = await deleteMediaShareByAdmin(shareId);

  if (!deleted) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  // Log the deletion
  await logAuditEvent({
    action: "media_share.deleted",
    actor: user.username,
    target: `share:${shareId}`,
    metadata: { shareId },
    ip: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}
