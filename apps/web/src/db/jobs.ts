import { getPool, ensureSchema } from "./core";


export type Job = {
  id: number;
  name: string;
  schedule: string;
  intervalSeconds: number;
  type: "system" | "user";
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  runOnStart: boolean;
  failureCount: number;
  lastError: string | null;
  disabledReason: string | null;
};


export async function listJobs(): Promise<Job[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(`SELECT * FROM jobs ORDER BY name ASC`);
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    schedule: r.schedule,
    intervalSeconds: r.interval_seconds,
    type: r.type,
    enabled: r.enabled,
    lastRun: r.last_run,
    nextRun: r.next_run,
    runOnStart: r.run_on_start,
    failureCount: r.failure_count ?? 0,
    lastError: r.last_error ?? null,
    disabledReason: r.disabled_reason ?? null
  }));
}


export async function getJob(name: string): Promise<Job | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(`SELECT * FROM jobs WHERE name = $1`, [name]);
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    name: r.name,
    schedule: r.schedule,
    intervalSeconds: r.interval_seconds,
    type: r.type,
    enabled: r.enabled,
    lastRun: r.last_run,
    nextRun: r.next_run,
    runOnStart: r.run_on_start,
    failureCount: r.failure_count ?? 0,
    lastError: r.last_error ?? null,
    disabledReason: r.disabled_reason ?? null
  };
}


export async function updateJob(id: number, schedule: string, intervalSeconds: number) {
  const p = getPool();
  await p.query(
    `UPDATE jobs SET schedule = $1, interval_seconds = $2 WHERE id = $3`,
    [schedule, intervalSeconds, id]
  );
}


export async function updateJobSchedule(id: number, schedule: string, intervalSeconds: number, nextRun: Date) {
  const p = getPool();
  await p.query(
    `UPDATE jobs
     SET schedule = $1,
         interval_seconds = $2,
         next_run = $3
     WHERE id = $4`,
    [schedule, intervalSeconds, nextRun, id]
  );
}


export async function updateJobRun(id: number, lastRun: Date, nextRun: Date) {
  const p = getPool();
  await p.query(
    `UPDATE jobs
     SET last_run = $1,
         next_run = $2,
         failure_count = 0,
         last_error = NULL
     WHERE id = $3`,
    [lastRun, nextRun, id]
  );
}


export async function updateJobEnabled(id: number, enabled: boolean, nextRun?: Date): Promise<void> {
  const p = getPool();
  if (enabled) {
    await p.query(
      `UPDATE jobs
       SET enabled = TRUE,
           disabled_reason = NULL,
           failure_count = 0,
           last_error = NULL,
           next_run = COALESCE($2, next_run)
       WHERE id = $1`,
      [id, nextRun ?? null]
    );
    return;
  }
  await p.query(
    `UPDATE jobs
     SET enabled = FALSE,
         disabled_reason = $2
     WHERE id = $1`,
    [id, "Disabled by admin"]
  );
}


export async function recordJobFailure(id: number, error: string, maxFailures: number): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `UPDATE jobs
     SET failure_count = COALESCE(failure_count, 0) + 1,
         last_error = $2
     WHERE id = $1
     RETURNING failure_count`,
    [id, error]
  );
  const failures = Number(res.rows[0]?.failure_count ?? 0);
  if (failures >= maxFailures) {
    await p.query(
      `UPDATE jobs
       SET enabled = FALSE,
           disabled_reason = $2
       WHERE id = $1`,
      [id, `Disabled after ${failures} failures`]
    );
  }
  return failures;
}


export async function insertJobHistory(
  jobName: string,
  status: "success" | "failure",
  startedAt: Date,
  finishedAt: Date,
  durationMs: number,
  error: string | null,
  details?: string
): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO job_history (job_name, status, started_at, finished_at, duration_ms, error, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [jobName, status, startedAt, finishedAt, durationMs, error ?? null, details ?? null]
  );
  // Prune: keep only last 500 per job
  await p.query(
    `DELETE FROM job_history WHERE job_name = $1 AND id NOT IN (
       SELECT id FROM job_history WHERE job_name = $1 ORDER BY started_at DESC LIMIT 500
     )`,
    [jobName]
  );
}


export async function getJobHistory(
  jobName?: string,
  limit = 50,
  offset = 0
): Promise<{
  entries: {
    id: number;
    jobName: string;
    status: "success" | "failure";
    startedAt: Date | string;
    finishedAt: Date | string | null;
    durationMs: number | null;
    error: string | null;
    details: string | null;
  }[];
  total: number;
}> {
  const p = getPool();
  const where = jobName ? `WHERE job_name = $1` : "";
  const params: any[] = jobName ? [jobName] : [];
  const countRes = await p.query(
    `SELECT COUNT(*) as count FROM job_history ${where}`,
    params
  );
  const total = Number(countRes.rows[0]?.count ?? 0);
  const dataRes = await p.query(
    `SELECT id, job_name, status, started_at, finished_at, duration_ms, error, details
     FROM job_history ${where}
     ORDER BY started_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const entries = dataRes.rows.map((row) => ({
    id: row.id,
    jobName: row.job_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    error: row.error,
    details: row.details,
  }));
  return { entries, total };
}


export async function clearJobHistory(jobName?: string): Promise<number> {
  const p = getPool();
  const res = jobName
    ? await p.query(`DELETE FROM job_history WHERE job_name = $1`, [jobName])
    : await p.query(`DELETE FROM job_history`);
  return res.rowCount ?? 0;
}
