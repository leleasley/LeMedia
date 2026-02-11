import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { basename } from "path";
import { requireAdmin } from "@/auth";
import { getBackupPath } from "@/lib/backups";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { name } = await params;
  const backupPath = await getBackupPath(name);
  if (!backupPath) {
    return NextResponse.json({ error: "Invalid backup name" }, { status: 400 });
  }

  let file: Buffer;
  try {
    file = await fs.readFile(backupPath);
  } catch {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  return new NextResponse(file as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${basename(name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
