import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { listJobs, updateJobEnabled } from "@/db";
import { computeNextRun } from "@/lib/jobs";
import { requireCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = await params;
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === Number(id));
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const nextRun = computeNextRun(job.schedule, job.intervalSeconds);
  await updateJobEnabled(job.id, true, nextRun);

  return NextResponse.json({ success: true });
}
