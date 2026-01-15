import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { runJobNow } from "@/lib/jobs";
import { listJobs } from "@/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  
  const { id } = await params;
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === Number(id));
  
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    await runJobNow(job.name);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
