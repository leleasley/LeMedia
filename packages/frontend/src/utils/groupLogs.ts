/** A log row that stands for one or more identical entries. */
export interface LogEntryLike { id: number; level: string; label: string; message: string; createdAt: string }
export interface LogGroup<T extends LogEntryLike = LogEntryLike> {
  signature: string;
  log: T;
  count: number;
  newest: string;
  oldest: string;
}

/** Collapse repeats of the same entry (level + label + first line) into one row with a count.
 *
 *  Rows arrive newest-first, so a group keeps its newest position and remembers the oldest time
 *  it covers. A banner printed every 15 minutes then occupies one row instead of fifty.
 */
export function groupLogs<T extends LogEntryLike>(logs: T[]): LogGroup<T>[] {
  const groups: LogGroup<T>[] = [];
  const bySignature = new Map<string, LogGroup<T>>();
  for (const log of logs) {
    const head = log.message.split('\n---\n')[0];
    const signature = `${log.level}\u0000${log.label}\u0000${head}`;
    const seen = bySignature.get(signature);
    if (seen) {
      seen.count += 1;
      seen.oldest = log.createdAt;
      continue;
    }
    const group = { signature, log, count: 1, newest: log.createdAt, oldest: log.createdAt };
    bySignature.set(signature, group);
    groups.push(group);
  }
  return groups;
}
