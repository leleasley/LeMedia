import "server-only";
import { getPool, listJobs, recordJobFailure, updateJobRun, updateJobSchedule, type Job } from "@/db";
import { jobHandlers } from "./definitions";
import { logger } from "@/lib/logger";
import cronParser from "cron-parser";

let schedulerInterval: NodeJS.Timeout | null = null;
const SCHEDULER_LOCK_ID = 94810234;
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-production-export";

function getJobTimezone() {
  return process.env.JOBS_TIMEZONE || process.env.TZ || undefined;
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
  const isField = (value: string) => value === "*" || /^\d+$/.test(value);
  if (![minute, hour, dayOfMonth, month, dayOfWeek].every(isField)) return null;
  if (month !== "*") return null;
  return { minute, hour, dayOfMonth, dayOfWeek };
}

function computeSimpleCronNextRun(schedule: string, now: Date) {
  const parsed = parseSimpleCron(schedule);
  if (!parsed) return null;
  const minute = Number(parsed.minute);
  const hour = Number(parsed.hour);
  if (Number.isNaN(minute) || Number.isNaN(hour)) return null;

  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(minute);
  candidate.setHours(hour);

  if (parsed.dayOfMonth === "*" && parsed.dayOfWeek === "*") {
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }

  if (parsed.dayOfMonth === "*" && parsed.dayOfWeek !== "*") {
    const targetDow = Number(parsed.dayOfWeek);
    if (Number.isNaN(targetDow) || targetDow < 0 || targetDow > 6) return null;
    const currentDow = candidate.getDay();
    let daysAhead = (targetDow - currentDow + 7) % 7;
    if (daysAhead === 0 && candidate <= now) daysAhead = 7;
    candidate.setDate(candidate.getDate() + daysAhead);
    return candidate;
  }

  if (parsed.dayOfMonth !== "*" && parsed.dayOfWeek === "*") {
    const targetDom = Number(parsed.dayOfMonth);
    if (Number.isNaN(targetDom) || targetDom < 1 || targetDom > 28) return null;
    candidate.setDate(targetDom);
    if (candidate <= now) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(targetDom);
    }
    return candidate;
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

  try {
    logger.info(`[Job] Executing ${job.name}...`);
    await handler();
    
    // Calculate next run
    const now = new Date();
    const nextRun = computeNextRun(job.schedule, job.intervalSeconds, now);

    await updateJobRun(job.id, now, nextRun);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error(`[Job] Job ${job.name} failed`, err);
    await recordJobFailure(job.id, message, 3);
  }
}

export function startJobScheduler() {
  if (schedulerInterval || isBuildPhase || process.env.NODE_ENV === "test") return;

  // Run every minute to check for pending jobs
  schedulerInterval = setInterval(async () => {
    try {
      const pool = getPool();
      const lock = await pool.query("SELECT pg_try_advisory_lock($1) AS locked", [SCHEDULER_LOCK_ID]);
      if (!lock.rows?.[0]?.locked) {
        return;
      }

      const jobs = await listJobs();
      const now = new Date();

      for (const job of jobs) {
        if (!job.enabled) continue;

        let nextRun = job.nextRun ? new Date(job.nextRun) : null;
        if (nextRun && isCronSchedule(job.schedule) && now < nextRun) {
          const expectedNext = computeNextRun(job.schedule, job.intervalSeconds, now);
          if (Math.abs(expectedNext.getTime() - nextRun.getTime()) > 60 * 1000) {
            await updateJobSchedule(job.id, job.schedule, job.intervalSeconds, expectedNext);
            nextRun = expectedNext;
          }
        }

        // Check if it's time to run
        // If nextRun is null (first run), run immediately if runOnStart is true,
        // OR if lastRun is null (never ran) and runOnStart is true.
        // Actually, db migration sets next_run to NULL initially.

        let shouldRun = false;

        if (!nextRun) {
            // First time seeing this job
            if (job.runOnStart) {
                shouldRun = true;
            } else {
                // Initialize nextRun
                const nextRun = computeNextRun(job.schedule, job.intervalSeconds, now);
                await updateJobRun(job.id, new Date(0), nextRun); // Set lastRun to epoch to indicate initialized
                continue;
            }
        } else if (now >= nextRun) {
            // Time to run the job
            shouldRun = true;
        }

        if (shouldRun) {
            void runJob(job);
        }
      }
      await pool.query("SELECT pg_advisory_unlock($1)", [SCHEDULER_LOCK_ID]);
    } catch (err) {
      logger.error("[Job] Scheduler error", err);
      try {
        await getPool().query("SELECT pg_advisory_unlock($1)", [SCHEDULER_LOCK_ID]);
      } catch {
        // Ignore unlock errors if connection failed
      }
    }
  }, 60 * 1000);

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
