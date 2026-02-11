import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { createBackupArchive, getBackupMaxFiles, listBackups } from "@/lib/backups";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const backups = await listBackups();
  return NextResponse.json({
    backups,
    maxFiles: getBackupMaxFiles(),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  try {
    const backup = await createBackupArchive({ trigger: "manual" });
    return NextResponse.json({ ok: true, backup });
  } catch (error) {
    logger.error("[Backup] Failed to create backup", error);
    return NextResponse.json({ error: "Failed to create backup archive" }, { status: 500 });
  }
}
