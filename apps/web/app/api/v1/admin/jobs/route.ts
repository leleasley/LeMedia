import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { listJobs, updateJob } from "@/db";
import { z } from "zod";

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
  
  try {
    const body = await req.json();
    const { id, schedule, intervalSeconds } = UpdateJobSchema.parse(body);
    await updateJob(id, schedule, intervalSeconds);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
