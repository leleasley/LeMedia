import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJobHistory } from "@/db";

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
