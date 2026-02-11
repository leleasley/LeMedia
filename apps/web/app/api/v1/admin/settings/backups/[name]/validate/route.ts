import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { validateBackupArchive } from "@/lib/backups";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { name } = await params;
  const result = await validateBackupArchive(name);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
