import "server-only";
import { getPool, getSetting, insertJobHistory, listJobs, recordJobFailure, updateJobRun, updateJobSchedule, type Job } from "@/db";
import { jobHandlers } from "./definitions";
import { logger } from "@/lib/logger";
import cronParser from "cron-parser";

let schedulerInterval: NodeJS.Timeout | null = null;
const SCHEDULER_LOCK_ID = 94810234;
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-production-export";

// Track which jobs are currently running to prevent duplicate execution
const runningJobs = new Set<string>();
let tickCount = 0;

export function getRunningJobNames(): string[] {
  return Array.from(runningJobs);
}

export type JobRuntimeMetrics = {
  name: string;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  failureRate: number;
  avgDurationMs: number;
  lastDurationMs: number | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastResult: "success" | "failure" | "none";
  lastError: string | null;
};

type JobRuntimeState = {
  name: string;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  durationTotalMs: number;
  lastDurationMs: number | null;
  lastStartedAt: number | null;
  lastFinishedAt: number | null;
  lastResult: "success" | "failure" | "none";
  lastError: string | null;
};

const runtimeStore = globalThis as typeof globalThis & {
  __lemediaJobRuntimeMetrics?: Map<string, JobRuntimeState>;
};

const jobRuntimeMetrics = runtimeStore.__lemediaJobRuntimeMetrics ?? new Map<string, JobRuntimeState>();
runtimeStore.__lemediaJobRuntimeMetrics = jobRuntimeMetrics;

function getRuntimeState(name: string): JobRuntimeState {
  const existing = jobRuntimeMetrics.get(name);
  if (existing) return existing;
  const created: JobRuntimeState = {
    name,
    totalRuns: 0,
    successRuns: 0,
    failedRuns: 0,
    durationTotalMs: 0,
    lastDurationMs: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastResult: "none",
    lastError: null,
  };
  jobRuntimeMetrics.set(name, created);
  return created;
}

function markJobStart(name: string) {
  const state = getRuntimeState(name);
  state.totalRuns += 1;
  state.lastStartedAt = Date.now();
  state.lastError = null;
}

function markJobResult(name: string, result: "success" | "failure", error?: string) {
  const state = getRuntimeState(name);
  const finishedAt = Date.now();
  state.lastFinishedAt = finishedAt;
  state.lastResult = result;
  if (result === "success") {
    state.successRuns += 1;
    state.lastError = null;
  } else {
    state.failedRuns += 1;
    state.lastError = error ?? "Unknown error";
  }
  if (state.lastStartedAt) {
    const duration = Math.max(0, finishedAt - state.lastStartedAt);
    state.lastDurationMs = duration;
    state.durationTotalMs += duration;
  }
}

export function getJobRuntimeMetrics(): JobRuntimeMetrics[] {
  return Array.from(jobRuntimeMetrics.values())
    .map((state) => {
      const successRate = state.totalRuns > 0 ? state.successRuns / state.totalRuns : 0;
      const failureRate = state.totalRuns > 0 ? state.failedRuns / state.totalRuns : 0;
      const avgDurationMs = state.totalRuns > 0 ? state.durationTotalMs / state.totalRuns : 0;
      return {
        name: state.name,
        totalRuns: state.totalRuns,
        successRuns: state.successRuns,
        failedRuns: state.failedRuns,
        successRate,
        failureRate,
        avgDurationMs,
        lastDurationMs: state.lastDurationMs,
        lastStartedAt: state.lastStartedAt ? new Date(state.lastStartedAt).toISOString() : null,
        lastFinishedAt: state.lastFinishedAt ? new Date(state.lastFinishedAt).toISOString() : null,
        lastResult: state.lastResult,
        lastError: state.lastError,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeJobTimezone(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

function getJobTimezone() {
  return normalizeJobTimezone(process.env.JOBS_TIMEZONE) || normalizeJobTimezone(process.env.TZ) || undefined;
}

async function primeJobTimezoneFromSettings() {
  try {
    const raw = await getSetting("jobs.timezone");
    const normalized = normalizeJobTimezone(raw);
    if (normalized) {
      process.env.JOBS_TIMEZONE = normalized;
    } else if (process.env.JOBS_TIMEZONE) {
      delete process.env.JOBS_TIMEZONE;
    }
  } catch {
    // Ignore failures; fallback to env defaults.
  }
}

function getCronParser() {
  const parser = (cronParser as any)?.CronExpressionParser
    ?? (cronParser as any)?.default?.CronExpressionParser
    ?? (cronParser as any)?.default;
  if (!parser?.parse) {
    throw new Error("Cron parser unavailable");
  }
  return parser;
}

function isCronSchedule(schedule: string) {
  return schedule.trim().split(/\s+/).length === 5;
}

function parseSimpleCron(schedule: string) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const isField = (value: string) => value === "*" || /^\d+$/.test(value) || /^\*\/\d+$/.test(value);
  if (![minute, hour, dayOfMonth, month, dayOfWeek].every(isField)) return null;
  if (month !== "*") return null;
  return { minute, hour, dayOfMonth, dayOfWeek };
}

/**
 * Expand a cron field into a sorted array of matching values.
 * Supports: star, digits, and star-slash-N step patterns.
 */
function expandCronField(field: string, min: number, max: number): number[] | null {
  if (field === "*") {
    const arr: number[] = [];
    for (let i = min; i <= max; i++) arr.push(i);
    return arr;
  }
  if (/^\d+$/.test(field)) {
    const val = Number(field);
    return (val >= min && val <= max) ? [val] : null;
  }
  const stepMatch = field.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    if (step <= 0) return null;
    const arr: number[] = [];
    for (let i = 0; i <= max; i += step) arr.push(i);
    return arr;
  }
  return null;
}

function computeSimpleCronNextRun(schedule: string, now: Date): Date | null {
  const parsed = parseSimpleCron(schedule);
  if (!parsed) return null;

  const minuteVals = expandCronField(parsed.minute, 0, 59);
  const hourVals = expandCronField(parsed.hour, 0, 23);
  if (!minuteVals || !hourVals || minuteVals.length === 0 || hourVals.length === 0) return null;

  // Only support * or fixed number for day fields (no step patterns for days)
  if (parsed.dayOfWeek !== "*" && !/^\d+$/.test(parsed.dayOfWeek)) return null;
  if (parsed.dayOfMonth !== "*" && !/^\d+$/.test(parsed.dayOfMonth)) return null;

  const targetDow = parsed.dayOfWeek !== "*" ? Number(parsed.dayOfWeek) : null;
  const targetDom = parsed.dayOfMonth !== "*" ? Number(parsed.dayOfMonth) : null;

  // Search up to 35 days ahead (covers monthly schedules)
  for (let dayOffset = 0; dayOffset < 35; dayOffset++) {
    const dayBase = new Date(now);
    dayBase.setDate(dayBase.getDate() + dayOffset);
    dayBase.setHours(0, 0, 0, 0);

    // Check day-of-week constraint
    if (targetDow !== null && dayBase.getDay() !== targetDow) continue;
    // Check day-of-month constraint
    if (targetDom !== null && dayBase.getDate() !== targetDom) continue;

    for (const hr of hourVals) {
      // Skip past hours on current day for efficiency
      if (dayOffset === 0 && hr < now.getHours()) continue;
      for (const min of minuteVals) {
        const candidate = new Date(dayBase);
        candidate.setHours(hr, min, 0, 0);
        if (candidate > now) {
          return candidate;
        }
      }
    }
  }

  return null;
}

export function computeNextRun(schedule: string, intervalSeconds: number, now = new Date()) {
  let nextRun = new Date(now.getTime() + intervalSeconds * 1000);
  try {
    const simpleNext = computeSimpleCronNextRun(schedule, now);
    if (simpleNext) return simpleNext;
    const options: any = { currentDate: now };
    const tz = getJobTimezone();
    if (tz) {
      options.tz = tz;
    }
    const parser = getCronParser();
    const interval = parser.parse(schedule, options);
    nextRun = interval.next().toDate();
  } catch {
    // Fall back to intervalSeconds if cron parsing fails.
  }
  return nextRun;
}

async function runJob(job: Job) {
  const handler = jobHandlers[job.name];
  if (!handler) {
    logger.warn(`[Job] No handler found for job: ${job.name}`);
    return;
  }

  // Prevent duplicate execution if the job is still running from a previous tick
  if (runningJobs.has(job.name)) {
    logger.info(`[Job] Skipping ${job.name} — still running from previous execution`);
    return;
  }

  runningJobs.add(job.name);
  markJobStart(job.name);
  const startedAt = new Date();

  try {
    logger.info(`[Job] Executing ${job.name}...`);
    const result = await handler();
    
    // Calculate next run
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const nextRun = computeNextRun(job.schedule, job.intervalSeconds, finishedAt);

    await updateJobRun(job.id, finishedAt, nextRun);
    markJobResult(job.name, "success");
    logger.info(`[Job] ${job.name} completed in ${durationMs}ms — next run: ${nextRun.toISOString()}`);

    // Record in persistent history
    const details = typeof result === "string" ? result : undefined;
    await insertJobHistory(job.name, "success", startedAt, finishedAt, durationMs, null, details).catch(() => {});
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error(`[Job] Job ${job.name} failed after ${durationMs}ms`, err);
    await recordJobFailure(job.id, message, 3);
    markJobResult(job.name, "failure", message);

    // Record failure in persistent history
    await insertJobHistory(job.name, "failure", startedAt, finishedAt, durationMs, message).catch(() => {});
  } finally {
    runningJobs.delete(job.name);
  }
}

async function schedulerTick() {
  tickCount++;
  const pool = getPool();
  let client: import("pg").PoolClient | null = null;

  try {
    // Use a DEDICATED client so advisory lock + unlock happen on the SAME connection.
    // pool.query() can dispatch to different connections, causing the unlock to silently
    // fail (advisory locks are session-level in PostgreSQL).
    client = await pool.connect();

    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [SCHEDULER_LOCK_ID]);
    if (!lock.rows?.[0]?.locked) {
      logger.info(`[Job] Scheduler tick #${tickCount} — skipped (another instance holds the lock)`);
      client.release();
      return;
    }

    try {
      const jobs = await listJobs();
      const now = new Date();
      let firedCount = 0;
      let skippedCount = 0;
      let disabledCount = 0;

      for (const job of jobs) {
        if (!job.enabled) {
          disabledCount++;
          continue;
        }

        let nextRun = job.nextRun ? new Date(job.nextRun) : null;

        // Schedule correction: if the stored next_run doesn't match
        // what the schedule says, update it so the job fires on time.
        if (nextRun && now < nextRun) {
          let expectedNext: Date | null = null;

          if (isCronSchedule(job.schedule)) {
            expectedNext = computeNextRun(job.schedule, job.intervalSeconds, now);
          }
          // For interval-based (non-cron) schedules, the next_run computed
          // from the last run + interval should be authoritative. Only
          // correct if the stored interval_seconds has changed.

          if (expectedNext && Math.abs(expectedNext.getTime() - nextRun.getTime()) > 60 * 1000) {
            await updateJobSchedule(job.id, job.schedule, job.intervalSeconds, expectedNext);
            nextRun = expectedNext;
          }
        }

        let shouldRun = false;

        if (!nextRun) {
            // First time seeing this job
            if (job.runOnStart) {
                shouldRun = true;
            } else {
                // Initialize nextRun
                const computedNextRun = computeNextRun(job.schedule, job.intervalSeconds, now);
                await updateJobRun(job.id, new Date(0), computedNextRun);
                continue;
            }
        } else if (now >= nextRun) {
            shouldRun = true;
        }

        if (shouldRun) {
            if (runningJobs.has(job.name)) {
              skippedCount++;
            } else {
              firedCount++;
              void runJob(job);
            }
        }
      }

      // Periodic heartbeat: log summary every tick so operators can verify
      // the scheduler is alive even when no jobs fire.
      const enabledCount = jobs.length - disabledCount;
      const runningList = runningJobs.size > 0 ? ` | running: ${Array.from(runningJobs).join(", ")}` : "";
      logger.info(
        `[Job] Scheduler tick #${tickCount} — ${enabledCount} enabled, ${firedCount} fired, ${skippedCount} skipped (in-progress)${runningList}`
      );
    } finally {
      // Always release the advisory lock on the SAME client that acquired it
      await client.query("SELECT pg_advisory_unlock($1)", [SCHEDULER_LOCK_ID]);
    }
  } catch (err) {
    logger.error("[Job] Scheduler tick error", err);
    // Try to release lock if we have the client
    if (client) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [SCHEDULER_LOCK_ID]);
      } catch {
        // Ignore unlock errors if connection failed
      }
    }
  } finally {
    // Always release the client back to the pool
    if (client) {
      try {
        client.release();
      } catch {
        // Ignore release errors
      }
    }
  }
}

export function startJobScheduler() {
  if (schedulerInterval || isBuildPhase || process.env.NODE_ENV === "test") return;

  void primeJobTimezoneFromSettings();

  logger.info("[Job] Scheduler starting — ticking every 60s, advisory lock ID: " + SCHEDULER_LOCK_ID);

  // Run the first tick immediately so jobs start without delay
  void schedulerTick();

  // Then continue checking every 60 seconds
  schedulerInterval = setInterval(schedulerTick, 60 * 1000);

  logger.info("[Job] Scheduler started");
}

export function stopJobScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("[Job] Scheduler stopped");
  }
}

// Force run a job immediately
export async function runJobNow(name: string) {
    const jobs = await listJobs();
    const job = jobs.find(j => j.name === name);
    if (job) {
        return runJob(job);
    }
    throw new Error(`Job ${name} not found`);
}
