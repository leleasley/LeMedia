import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { deleteBackupArchive } from "@/lib/backups";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { name } = await params;
  const result = await deleteBackupArchive(name);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "Backup file not found" ? 404 : 400 });
  }
  return NextResponse.json(result);
}
