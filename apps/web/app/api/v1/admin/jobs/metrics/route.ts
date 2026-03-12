import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJobRuntimeMetrics, getRunningJobNames } from "@/lib/jobs";
import { buildJobMetricsSummary } from "@/lib/jobs-metrics-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const metrics = getJobRuntimeMetrics();
  const runningJobs = getRunningJobNames();
  const summary = buildJobMetricsSummary(metrics);

  const res = NextResponse.json({
    summary,
    metrics,
    runningJobs,
  });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
