import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJobHistory, clearJobHistory } from "@/db";
import { requireCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const jobName = searchParams.get("job") || undefined;
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || "50"), 1), 200);
  const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

  const { entries, total } = await getJobHistory(jobName, limit, offset);

  const res = NextResponse.json({ entries, total, limit, offset });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { searchParams } = new URL(req.url);
  const jobName = searchParams.get("job") || undefined;

  const deleted = await clearJobHistory(jobName);
  return NextResponse.json({ deleted });
}
