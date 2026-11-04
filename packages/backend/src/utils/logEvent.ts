import { prisma } from './prisma.js';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/** Strip newlines/tabs from single-line fields to prevent log injection. Stack traces keep
 *  their newlines — they're appended to `message` inside a clearly-bounded block. */
function sanitizeLine(input: string): string {
  return input.replaceAll(/[\r\n\t]/g, ' ');
}

/** Redact the stack so "at …/<hostdir>/app/…" becomes "at <app>/…" — avoids shipping the op's
 *  home path when they copy-share a log entry. */
function redactStack(stack: string): string {
  return stack
    .split('\n')
    .map((line) => line.replace(/(\s+at\s+(?:[^(]+\()?)[^\s()]*?(\/packages\/[^)\s]+)/, '$1<app>$2'))
    .join('\n');
}

export async function logEvent(level: LogLevel, label: string, message: string, err?: unknown) {
  // Sanitize label at entry so every downstream consumer (DB row, stdout, stderr) sees the
  // stripped form — blocks CRLF injection into the log stream.
  const safeLabel = sanitizeLine(label);
  let body = sanitizeLine(message);
  if (err instanceof Error && err.stack) {
    body += `\n---\n${redactStack(err.stack)}`;
  } else if (err != null) {
    body += `\n---\n${sanitizeLine(String(err))}`;
  }
  // JSON-encode before writing to a log stream: escapes every control char (incl. CRLF) and is
  // on CodeQL's recognized sanitizer list for log-injection. DB storage keeps the raw body
  // because it's a typed column, not a stream an aggregator will re-parse line-by-line.
  const consoleLine = JSON.stringify({ label: safeLabel, body: body.slice(0, 2000) });
  if (level === 'debug') {
    console.log(consoleLine);
    if (process.env.DEBUG_LOGS !== 'true') return;
  }
  try {
    await prisma.appLog.create({ data: { level, label: safeLabel, message: body } });
  } catch (dbErr) {
    console.error(`logEvent:${level}`, consoleLine, dbErr);
  }
}

/**
 * Retention prune for AppLog + PluginLog (prevents unbounded SQLite growth).
 * Deletes rows older than `retentionDays` (env LOG_RETENTION_DAYS, default 30).
 * Runs as a daily cron job.
 *
 * Chunked on purpose: a single deleteMany over tens of thousands of rows holds SQLite's one
 * write lock for the whole statement, which overruns the query timeout and fails the job with a
 * ConnectorError — and the log table then grows forever. Deleting in id-sized batches keeps each
 * statement short enough to finish while the app keeps writing logs.
 */
export async function pruneOldLogs(retentionDays?: number): Promise<{ appLog: number; pluginLog: number }> {
  const days = retentionDays
    ?? Number.parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const CHUNK = 1000;

  type PrunableModel = { findMany: (args: unknown) => Promise<{ id: number }[]>; deleteMany: (args: unknown) => Promise<{ count: number }> };
  const prune = async (model: PrunableModel): Promise<number> => {
    let removed = 0;
    for (;;) {
      const rows = await model.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: CHUNK,
      });
      if (rows.length === 0) break;
      const res = await model.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      removed += res.count;
      if (rows.length < CHUNK) break;
    }
    return removed;
  };

  const [appLog, pluginLog] = await Promise.all([
    // Prisma's delegate generics don't line up with the narrow shape; the calls used are the same.
    prune(prisma.appLog as unknown as PrunableModel),
    prune(prisma.pluginLog as unknown as PrunableModel),
  ]);
  return { appLog, pluginLog };
}
