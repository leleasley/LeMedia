import "server-only";
import { listJobs, recordJobFailure, updateJobRun, type Job } from "@/db";
import { jobHandlers } from "./definitions";
import { logger } from "@/lib/logger";
import cronParser from "cron-parser";

let schedulerInterval: NodeJS.Timeout | null = null;

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
    let nextRun = new Date(now.getTime() + job.intervalSeconds * 1000);
    
    try {
        // Try to parse as cron expression
        // @ts-ignore
        const interval = cronParser.parseExpression(job.schedule);
        nextRun = interval.next().toDate();
    } catch {
        // Fallback to intervalSeconds if cron parse fails
    }

    await updateJobRun(job.id, now, nextRun);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error(`[Job] Job ${job.name} failed`, err);
    await recordJobFailure(job.id, message, 3);
  }
}

export function startJobScheduler() {
  if (schedulerInterval) return;

  // Run every minute to check for pending jobs
  schedulerInterval = setInterval(async () => {
    try {
      const jobs = await listJobs();
      const now = new Date();

      for (const job of jobs) {
        if (!job.enabled) continue;

        // Check if it's time to run
        // If nextRun is null (first run), run immediately if runOnStart is true,
        // OR if lastRun is null (never ran) and runOnStart is true.
        // Actually, db migration sets next_run to NULL initially.

        let shouldRun = false;

        if (!job.nextRun) {
            // First time seeing this job
            if (job.runOnStart) {
                shouldRun = true;
            } else {
                // Initialize nextRun
                let nextRun = new Date(now.getTime() + job.intervalSeconds * 1000);
                try {
                    // @ts-ignore
        const interval = cronParser.parseExpression(job.schedule);
                    nextRun = interval.next().toDate();
                } catch {}
                await updateJobRun(job.id, new Date(0), nextRun); // Set lastRun to epoch to indicate initialized
                continue;
            }
        } else if (now >= new Date(job.nextRun)) {
            // Time to run the job
            shouldRun = true;
        }

        if (shouldRun) {
            void runJob(job);
        }
      }
    } catch (err) {
      logger.error("[Job] Scheduler error", err);
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
