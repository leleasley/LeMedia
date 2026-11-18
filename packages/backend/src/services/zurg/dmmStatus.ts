import type { ZurgJob, ZurgStatus } from './client.js';

/** DMM Want activity from Zurg's existing snapshot. This is not the DMM wanted list: the
 * sponsor API marks a list as polled when read, so calling it here would falsify Zurg's health. */
export function summarizeDmmSources(status: ZurgStatus | null) {
  if (!status) return null;
  const sources = (status.sources ?? []).filter(source => source.type === 'dmm');
  const ids = new Set(sources.map(source => source.id));
  const jobs = (status.jobs ?? []).filter(job => ids.has(job.source));
  const counts: Record<string, number> = {};
  for (const job of jobs) counts[job.state] = (counts[job.state] ?? 0) + 1;
  const recent = [...jobs].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(0, 20).map((j: ZurgJob) => ({
    source: j.source, item: j.item, state: j.state, detail: j.detail ?? null, nextRetry: j.next_retry ?? null,
    attempts: j.attempts ?? null, release: j.release ?? null, quality: j.quality ?? null, updatedAt: j.updated_at ?? null,
  }));
  return { sources: sources.map(source => ({ id: source.id, name: source.name ?? source.id })), total: jobs.length, counts, recent };
}
