/**
 * Host stats for the rex machine. rex itself only speaks the Plex API, so a small timer on
 * the rex host (`/root/rex-host/report.sh`) posts these every couple of minutes to
 * `POST /api/webhooks/rex-host` with the instance API key. Kept in memory: a restart just
 * shows "waiting for the first report" until the next push.
 */

export interface RexHostReport {
  hostname: string | null;
  os: string | null;
  uptimeSec: number | null;
  load: number[];
  cpus: number | null;
  memTotal: number | null;
  memAvailable: number | null;
  diskTotal: number | null;
  diskUsed: number | null;
  service: { active: boolean; since: string | null; rssBytes: number | null; restarts: number | null };
  binaryUpdated: string | null;
  files: { name: string; bytes: number }[];
  claimed: boolean;
  rexDirect: string | null;
  lastFeed: string | null;
  warnings1h: number | null;
  /** Release tag rex-update.sh last installed (e.g. 2026.10.28.0040-nightly). */
  rexVersion: string | null;
  catalog: { items: number; held: number; deleted: number } | null;
  sources: { name: string; url: string | null; mount: string | null }[];
}

let last: { at: string; report: RexHostReport } | null = null;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

/** Whitelists the pushed fields so nothing unexpected ends up in the admin page. */
export function setRexHostReport(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  const svc = (b.service ?? {}) as Record<string, unknown>;
  last = {
    at: new Date().toISOString(),
    report: {
      hostname: str(b.hostname, 80),
      os: str(b.os, 80),
      uptimeSec: num(b.uptimeSec),
      load: Array.isArray(b.load) ? b.load.map(num).filter((x): x is number => x !== null).slice(0, 3) : [],
      cpus: num(b.cpus),
      memTotal: num(b.memTotal),
      memAvailable: num(b.memAvailable),
      diskTotal: num(b.diskTotal),
      diskUsed: num(b.diskUsed),
      service: { active: svc.active === true, since: str(svc.since, 40), rssBytes: num(svc.rssBytes), restarts: num(svc.restarts) },
      binaryUpdated: str(b.binaryUpdated, 40),
      files: Array.isArray(b.files)
        ? b.files.slice(0, 10).flatMap((f) => {
          const r = f as Record<string, unknown>;
          const name = str(r.name, 60);
          const bytes = num(r.bytes);
          return name && bytes !== null ? [{ name, bytes }] : [];
        })
        : [],
      claimed: b.claimed === true,
      rexDirect: str(b.rexDirect, 120),
      lastFeed: str(b.lastFeed, 40),
      warnings1h: num(b.warnings1h),
      rexVersion: typeof b.rexVersion === 'string' && /^[\w.-]{3,60}$/.test(b.rexVersion) ? b.rexVersion : null,
      catalog: catalogOf(b.catalog),
      sources: Array.isArray(b.sources)
        ? b.sources.slice(0, 10).flatMap((x) => {
          const r = x as Record<string, unknown>;
          const name = str(r.name, 60);
          return name ? [{ name, url: str(r.url, 200), mount: str(r.mount, 200) }] : [];
        })
        : [],
    },
  };
  if (last.report.catalog) {
    history.push({ t: Date.now(), items: last.report.catalog.items, held: last.report.catalog.held });
    while (history.length > HISTORY_MAX) history.shift();
  }
  return true;
}

export function getRexHostReport() {
  return last;
}

function catalogOf(v: unknown) {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  const items = num(c.items); const held = num(c.held); const deleted = num(c.deleted);
  return items === null || held === null ? null : { items, held, deleted: deleted ?? 0 };
}

// ─── Library sync progress (ported from media-heal's rex panel) ───────
// rex holds each new file until zurg has probed its media details (~20 a minute), so a big
// library fills over hours. Samples come with every report (every couple of minutes).
const HISTORY_MAX = 180;
const STALL_MS = 15 * 60_000;
const history: { t: number; items: number; held: number }[] = [];

/** Percent identified, items-per-minute over the last hour, ETA, and whether it stopped moving. */
export function getRexSync() {
  const c = last?.report.catalog;
  if (!c) return null;
  const now = Date.now();
  const total = c.items + c.held;
  const recent = history.filter((h) => now - h.t <= 3600_000);
  let rate: number | null = null;
  if (recent.length >= 2) {
    const first = recent[0]; const lastS = recent[recent.length - 1];
    const span = (lastS.t - first.t) / 60_000;
    if (span > 0) rate = (lastS.items - first.items) / span;
  }
  const eta = rate && rate > 0 && c.held ? Math.round((c.held / rate) * 60) : null;
  const old = history.filter((h) => now - h.t >= STALL_MS);
  const ref = old[old.length - 1];
  const stalled = !!(c.held && ref && ref.held <= c.held && ref.items >= c.items);
  return {
    items: c.items, held: c.held, deleted: c.deleted, total,
    percent: total ? Math.round((c.items * 1000) / total) / 10 : 0,
    complete: c.held === 0 && total > 0,
    ratePerMin: rate !== null ? Math.round(rate * 100) / 100 : null,
    etaSecs: eta, stalled, samples: history.length, at: last?.at ?? null,
    sources: last?.report.sources ?? [],
  };
}
