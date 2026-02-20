import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJobRuntimeMetrics, getRunningJobNames } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const metrics = getJobRuntimeMetrics();
  const runningJobs = getRunningJobNames();
  const totalRuns = metrics.reduce((acc, item) => acc + item.totalRuns, 0);
  const totalSuccess = metrics.reduce((acc, item) => acc + item.successRuns, 0);
  const totalFailed = metrics.reduce((acc, item) => acc + item.failedRuns, 0);
  const avgDurationMs =
    metrics.length > 0
      ? metrics.reduce((acc, item) => acc + item.avgDurationMs, 0) / metrics.length
      : 0;

  const res = NextResponse.json({
    summary: {
      totalJobsTracked: metrics.length,
      totalRuns,
      totalSuccess,
      totalFailed,
      successRate: totalRuns > 0 ? totalSuccess / totalRuns : 0,
      avgDurationMs,
    },
    metrics,
    runningJobs,
  });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
