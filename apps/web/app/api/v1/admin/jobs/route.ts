import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { listJobs, updateJobSchedule } from "@/db";
import { z } from "zod";
import { computeNextRun } from "@/lib/jobs";
import { requireCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const jobs = await listJobs();
  const res = NextResponse.json(jobs);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

const UpdateJobSchema = z.object({
  id: z.coerce.number(),
  schedule: z.string(),
  intervalSeconds: z.coerce.number().min(1)
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  
  try {
    const body = await req.json();
    const { id, schedule, intervalSeconds } = UpdateJobSchema.parse(body);
    const nextRun = computeNextRun(schedule, intervalSeconds);
    await updateJobSchedule(id, schedule, intervalSeconds, nextRun);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
