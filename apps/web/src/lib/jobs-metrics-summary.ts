import type { JobRuntimeMetrics } from "@/lib/jobs";

export type JobMetricsSummary = {
  totalJobsTracked: number;
  totalRuns: number;
  totalSuccess: number;
  totalFailed: number;
  successRate: number;
  avgDurationMs: number;
};

export function buildJobMetricsSummary(metrics: JobRuntimeMetrics[]): JobMetricsSummary {
  const totalJobsTracked = metrics.length;
  const totalRuns = metrics.reduce((acc, item) => acc + item.totalRuns, 0);
  const totalSuccess = metrics.reduce((acc, item) => acc + item.successRuns, 0);
  const totalFailed = metrics.reduce((acc, item) => acc + item.failedRuns, 0);
  const weightedDurationSum = metrics.reduce((acc, item) => acc + item.avgDurationMs * item.totalRuns, 0);
  const avgDurationMs = totalRuns > 0 ? weightedDurationSum / totalRuns : 0;

  return {
    totalJobsTracked,
    totalRuns,
    totalSuccess,
    totalFailed,
    successRate: totalRuns > 0 ? totalSuccess / totalRuns : 0,
    avgDurationMs,
  };
}
