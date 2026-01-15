import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getRequestAnalytics } from "@/db";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;

  const analytics = await getRequestAnalytics({ startDate, endDate });

  return NextResponse.json({ analytics });
}
