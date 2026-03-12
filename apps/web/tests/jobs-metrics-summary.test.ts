import assert from "node:assert/strict";
import test from "node:test";

import { buildJobMetricsSummary } from "../src/lib/jobs-metrics-summary";

test("buildJobMetricsSummary computes weighted average duration across runs", () => {
  const summary = buildJobMetricsSummary([
    {
      name: "heavy-job",
      totalRuns: 1,
      successRuns: 1,
      failedRuns: 0,
      successRate: 1,
      failureRate: 0,
      avgDurationMs: 10_000,
      lastDurationMs: 10_000,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastResult: "success",
      lastError: null,
    },
    {
      name: "fast-job",
      totalRuns: 9,
      successRuns: 9,
      failedRuns: 0,
      successRate: 1,
      failureRate: 0,
      avgDurationMs: 100,
      lastDurationMs: 100,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastResult: "success",
      lastError: null,
    },
  ]);

  assert.equal(summary.totalJobsTracked, 2);
  assert.equal(summary.totalRuns, 10);
  assert.equal(summary.totalSuccess, 10);
  assert.equal(summary.totalFailed, 0);
  assert.equal(summary.successRate, 1);
  assert.equal(summary.avgDurationMs, 1090);
});

test("buildJobMetricsSummary handles no runs without division issues", () => {
  const summary = buildJobMetricsSummary([
    {
      name: "idle-job",
      totalRuns: 0,
      successRuns: 0,
      failedRuns: 0,
      successRate: 0,
      failureRate: 0,
      avgDurationMs: 500,
      lastDurationMs: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastResult: "none",
      lastError: null,
    },
  ]);

  assert.equal(summary.totalJobsTracked, 1);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.totalSuccess, 0);
  assert.equal(summary.totalFailed, 0);
  assert.equal(summary.successRate, 0);
  assert.equal(summary.avgDurationMs, 0);
});
