import { getRexCoverageSnapshot } from '../../services/rexCoverageJob.js';
import { rexShows, rexShowCoverage } from '../../services/rexCoverage.js';
import axios from 'axios';
import type { FastifyInstance } from 'fastify';
import { getZurgSnapshot, runZurgSync } from '../../services/zurg/watcher.js';
import { getZurgConn, zurgGet, zurgPost, type ZurgConn, type ZurgJob } from '../../services/zurg/client.js';
import { getAllServices } from '../../utils/services.js';
import { getRexConn, getRexHealth } from '../../services/rex.js';
import { getRexHostReport, getRexSync } from '../../services/rexHost.js';
import { validateGroup, type GroupItem } from '../../services/zurg/dupValidate.js';
import { getZurgUpdateJob, runningZurgUpdate, setZurgAutoUpdate, startZurgUpdate, zurgUpdateSettings } from '../../services/zurg/zurgUpdate.js';
import { runPlacementGuard } from '../../services/zurg/placementGuard.js';
import { logEvent } from '../../utils/logEvent.js';
import { SWAP_MIN_BYTES, checkSwappable } from '../../services/zurg/swap.js';
import { activeOverrides, markGone } from '../../services/zurg/reportOverrides.js';
import { cancelSwap, clearFinishedSwaps, enqueueSwap, listSwapJobs } from '../../services/zurg/swapQueue.js';
import { cancelRepair, clearFinishedRepairs, enqueueRepairs, listBroken, listRepairJobs, pauseRepairs, repairControl, resumeRepairs, type OnFail } from '../../services/zurg/repairQueue.js';

const pick = (j: ZurgJob) => ({
  source: j.source, item: j.item, state: j.state, detail: j.detail ?? null, nextRetry: j.next_retry ?? null,
  attempts: j.attempts ?? null, release: j.release ?? null, quality: j.quality ?? null, updatedAt: j.updated_at ?? null,
});
const byUpdatedDesc = (a: ZurgJob, b: ZurgJob) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '');

interface ZurgStats {
  active_streams?: number; built_at?: string; version?: string; library_size?: number; uptime?: string;
  stream_bytes?: number; repair_queue?: number; directory_counts?: Record<string, number>;
  user_infos?: { provider?: string; provider_type?: string; plan?: string; type?: string; expiration?: string; premium?: number }[];
}

/** Torrents zurg is still fetching on the debrid account, via its qBittorrent-compatible API.
 *  Only when that API's key is set on the Zurg service (optional field); null otherwise. */
async function getActiveDownloads(conn: ZurgConn): Promise<{ name: string; progress: number; state: string; sizeBytes: number; etaSec: number | null; category: string | null }[] | null> {
  const [svc] = await getAllServices('zurg');
  const key = svc?.config.qbittorrentApiKey;
  if (!key) return null;
  const { data } = await axios.get<{ name: string; progress: number; state: string; size: number; eta: number; category?: string }[]>(
    `${conn.base}/api/v2/torrents/info`, { timeout: 6000, headers: { Authorization: `Bearer ${key}` } },
  );
  return (Array.isArray(data) ? data : [])
    .filter((t) => t.progress < 1)
    .slice(0, 20)
    .map((t) => ({ name: t.name, progress: t.progress, state: t.state, sizeBytes: t.size, etaSec: t.eta > 0 && t.eta < 8_640_000 ? t.eta : null, category: t.category ?? null }));
}

const DUP_STATES = new Set(['referenced', 'no_reference', 'unknown']);
interface DupMember { hash: string; name: string; size?: number; added?: string; state?: string; reasons?: string[]; quality?: { name?: string } }
interface DupGroup { key: string; kind: string; title: string; notes?: string[]; members?: DupMember[]; items?: GroupItem[] }

/** Zurg's trash page is HTML only; rows are labelled cells with the id in the form actions. */
function parseTrash(html: string) {
  const strip = (x: string) => x.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const cell = (row: string, label: string) => {
    const m = new RegExp(`<td data-label="${label}">([\\s\\S]*?)</td>`).exec(row);
    return m ? m[1] : '';
  };
  const items = [];
  for (const row of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const id = /action="\/manage\/trash\/([A-Za-z0-9-]+)\/restore"/.exec(row)?.[1];
    if (!id) continue;
    const release = cell(row, 'Release');
    items.push({
      id,
      name: strip(release.replace(/<div class="trash-dim">[\s\S]*?<\/div>/, '')),
      size: strip(cell(row, 'Size')),
      why: strip(cell(row, 'Why')),
      removed: strip(cell(row, 'Removed')),
      accounts: strip(cell(row, 'Accounts')),
      deletedOnService: strip(cell(row, 'Deleted on the service')),
    });
  }
  return items;
}

/** POSTs to a zurg trash action and reads the outcome code from its redirect. */
async function trashAction(conn: ZurgConn, path: string): Promise<string> {
  const res = await axios.post(`${conn.base}${path}`, null, { timeout: 60_000, auth: conn.auth, maxRedirects: 0, validateStatus: (st) => st === 303 || st === 302 || st === 200 });
  const loc = String(res.headers.location ?? '');
  return new URLSearchParams(loc.split('?')[1] ?? '').get('msg') ?? 'ok';
}

/** Admin view of zurg: acquisition overview from the watcher snapshot plus a few live, cheap
 *  reads (mount, streams, provider types — never tokens) and two safe actions. */
export async function zurgAdminRoutes(app: FastifyInstance) {
  app.get('/zurg/overview', async () => {
    const conn = await getZurgConn();
    if (!conn) return { configured: false };

    const snap = getZurgSnapshot();
    const jobs = snap.status?.jobs ?? [];
    const counts: Record<string, number> = {};
    for (const j of jobs) counts[j.state] = (counts[j.state] ?? 0) + 1;

    const settle = <T,>(p: Promise<T>) => p.then((v) => v).catch(() => null);
    const [rclone, stats, providers, downloads] = await Promise.all([
      settle(zurgGet<{ status?: { state?: string; enabled?: boolean; last_start?: string } }>(conn, '/api/rclone/status', 5000)),
      settle(zurgGet<ZurgStats>(conn, '/stats', 8000)),
      settle(zurgGet<{ type?: string; name?: string }[]>(conn, '/api/providers', 5000)),
      settle(getActiveDownloads(conn)),
    ]);

    return {
      configured: true,
      serviceName: conn.name,
      reachable: !!(rclone || stats || providers),
      fetchedAt: snap.fetchedAt,
      error: snap.error,
      acquisition: {
        started: snap.status?.started ?? null,
        sources: (snap.status?.sources ?? []).map((s) => ({ id: s.id, name: s.name ?? s.id, type: s.type ?? null })),
        counts,
        total: jobs.length,
        recentGrabs: jobs.filter((j) => j.state === 'done').sort(byUpdatedDesc).slice(0, 8).map(pick),
        retrying: jobs.filter((j) => j.state === 'retrying').sort(byUpdatedDesc).slice(0, 10).map(pick),
        inFlight: jobs.filter((j) => !['done', 'retrying', 'set aside'].includes(j.state)).slice(0, 10).map(pick),
      },
      mount: rclone?.status ? { state: rclone.status.state ?? null, enabled: rclone.status.enabled ?? null, lastStart: rclone.status.last_start ?? null } : null,
      activeStreams: stats?.active_streams ?? null,
      builtAt: stats?.built_at ?? null,
      providers: Array.isArray(providers) ? providers.map((p) => ({ type: p.type ?? null, name: p.name ?? null })) : null,
      // Debrid accounts — plan and expiry only; the account email is never passed on.
      accounts: (stats?.user_infos ?? []).map((u) => ({
        provider: u.provider ?? u.provider_type ?? null,
        plan: u.plan ?? null,
        type: u.type ?? null,
        expiresAt: u.expiration ?? null,
        premiumSecondsLeft: typeof u.premium === 'number' ? u.premium : null,
      })),
      library: stats ? {
        size: stats.library_size ?? null,
        directories: stats.directory_counts ?? null,
        streamedBytes: stats.stream_bytes ?? null,
        uptime: stats.uptime ?? null,
        version: stats.version ?? null,
        repairQueue: stats.repair_queue ?? null,
      } : null,
      downloads,
    };
  });

  app.get('/rex/coverage', async () => getRexCoverageSnapshot());

  app.get('/rex/shows', async (_request, reply) => {
    const conn = await getRexConn();
    if (!conn) return reply.status(400).send({ error: 'REX_NOT_CONFIGURED' });
    return { shows: await rexShows(conn) };
  });
  app.get('/rex/shows/:key/coverage', async (request, reply) => {
    const { key } = request.params as { key: string };
    if (!/^\d+$/.test(key)) return reply.status(400).send({ error: 'INVALID_KEY' });
    const conn = await getRexConn();
    if (!conn) return reply.status(400).send({ error: 'REX_NOT_CONFIGURED' });
    return rexShowCoverage(conn, key);
  });

  // rex (Plex emulator) health + now playing, shown on the same admin page as zurg.
  app.get('/rex/health', async () => {
    const conn = await getRexConn();
    if (!conn) return { configured: false };
    return { configured: true, ...(await getRexHealth(conn)), host: getRexHostReport(), sync: getRexSync() };
  });

  // Zurg update through the host helper (pull the nightly image, recreate, verify).
  app.get('/zurg/update', async () => ({ ...(await zurgUpdateSettings()), running: runningZurgUpdate() }));
  app.put('/zurg/update', { schema: { body: { type: 'object' as const, required: ['autoUpdate'], properties: { autoUpdate: { type: 'boolean' as const } } } } },
    async (request) => setZurgAutoUpdate((request.body as { autoUpdate: boolean }).autoUpdate));
  app.post('/zurg/update', async (request, reply) => {
    try { return { jobId: (await startZurgUpdate('admin')).id }; }
    catch (err) { return reply.status(400).send({ error: (err as Error).message }); }
  });
  app.get('/zurg/update/jobs/:id', async (request, reply) => getZurgUpdateJob((request.params as { id: string }).id) ?? reply.status(404).send({ error: 'NOT_FOUND' }));
  // Check only (no rescans): what the placement-import guard would act on right now.
  app.get('/zurg/placement-guard', async () => runPlacementGuard(false));

  app.post('/zurg/sync', async () => {
    const result = await runZurgSync('admin');
    return { ok: true, ...result };
  });

  // ── Library cleanup: duplicates ──────────────────────────────────────────────────────────
  // ── Caches: zurg answers some reads slowly (the in-use check re-reads every *arr, ~14 s; the
  //    trash page ~2 s), so cleanup reads are cached briefly and refreshed after any change.
  //    Anything that deletes or swaps still re-checks live before acting. ──────────────────
  const DUP_TTL_MS = 5 * 60_000;
  const TRASH_TTL_MS = 5 * 60_000;
  const IN_USE_TTL_MS = 30 * 60_000;
  let dupCache: { at: number; data: Awaited<ReturnType<typeof computeDuplicates>> } | null = null;
  let trashCache: { at: number; items: ReturnType<typeof parseTrash> } | null = null;
  const inUse = new Map<string, { state: string; at: number }>();
  let lastAnalysisMs: number | null = null;
  let inUseRun: Promise<void> | null = null;
  const invalidateCleanup = () => { dupCache = null; trashCache = null; };
  // Keep the cleanup page warm: build the caches shortly after boot and refresh them in the
  // background, so opening the page never waits on zurg (report ~0.1 s, trash page ~2 s).
  const warm = async () => {
    const conn = await getZurgConn().catch(() => null);
    if (!conn) return;
    await Promise.all([getDuplicates(conn, true).catch(() => null), getTrash(conn, true).catch(() => null)]);
  };
  setTimeout(() => void warm(), 20_000).unref();
  setInterval(() => void warm(), 4 * 60_000).unref();

  // Any change (delete, swap, repair, restore, purge, refresh) makes the cached views stale.
  app.addHook('onResponse', async (request) => {
    if (request.method !== 'GET' && request.url.includes('/zurg/')) invalidateCleanup();
  });

  async function getDuplicates(conn: ZurgConn, fresh = false) {
    if (!fresh && dupCache && Date.now() - dupCache.at < DUP_TTL_MS) return withOverrides(dupCache.data);
    const data = await computeDuplicates(conn);
    // While zurg is re-reading Radarr/Sonarr the report changes under us — don't hold onto it.
    dupCache = data.refreshing ? null : { at: Date.now(), data };
    return withOverrides(data);
  }

  /** The cached report plus what LeMedia changed since it was built (see reportOverrides). */
  function withOverrides(data: Awaited<ReturnType<typeof computeDuplicates>>) {
    const ov = activeOverrides(data.builtAt);
    if (ov.size === 0) return data;
    const groups = data.groups
      .map((g) => ({ ...g, members: g.members.filter((m) => ov.get(m.hash) !== 'gone').map((m) => (ov.get(m.hash) === 'referenced' ? { ...m, state: 'referenced' as const } : m)) }))
      .filter((g) => g.members.length >= 2);
    const deletable = [...new Map(groups.flatMap((g) => g.members).filter((m) => m.state === 'no_reference').map((m) => [m.hash, m])).values()];
    const swaps = data.swaps.filter((c) => ov.get(c.current.hash) !== 'gone' && ov.get(c.smaller[0].hash) === undefined);
    return { ...data, groups, swaps, summary: { groups: groups.length, deletable: deletable.length, reclaimableBytes: deletable.reduce((n, m) => n + (m.sizeBytes ?? 0), 0) } };
  }

  async function getTrash(conn: ZurgConn, fresh = false) {
    if (!fresh && trashCache && Date.now() - trashCache.at < TRASH_TTL_MS) return trashCache.items;
    const html = await zurgGet<string>(conn, '/manage/trash/', 30_000);
    trashCache = { at: Date.now(), items: parseTrash(String(html)) };
    return trashCache.items;
  }

  /** Refresh "does Radarr/Sonarr use it?" for these hashes in the background (one run at a time). */
  function refreshInUse(conn: ZurgConn, hashes: string[]) {
    if (inUseRun || hashes.length === 0) return;
    inUseRun = zurgPost<{ releases?: { hash: string; state?: string }[] }>(conn, '/manage/duplicates/check', { hashes }, 120_000)
      .then((r) => { const now = Date.now(); for (const x of r.releases ?? []) inUse.set(x.hash, { state: x.state ?? 'unknown', at: now }); })
      .catch(() => { /* next view retries */ })
      .finally(() => { inUseRun = null; });
  }

  async function computeDuplicates(conn: ZurgConn) {
    const [report, status] = await Promise.all([
      zurgGet<{ built_at?: string; loaded?: boolean; blockers?: string[]; sources?: { name: string; state: string; problem?: string; read_at?: string }[]; movies?: DupGroup[]; seasons?: DupGroup[]; names?: DupGroup[]; states?: Record<string, { state?: string; reasons?: string[] }> }>(conn, '/manage/duplicates/report.json', 60_000),
      zurgGet<{ refreshing?: boolean; started?: string; finished?: string }>(conn, '/manage/duplicates/status', 10_000).catch(() => null),
    ]);
    const slim = (groups: DupGroup[] | undefined) => (groups ?? [])
      .filter((g) => (g.members?.length ?? 0) >= 2)
      .flatMap((g) => {
        // Zurg groups by a loose name match; keep only real copies of the same title.
        const all = slim1(g);
        const members = validateGroup(g, all.members);
        return members ? [{ ...all, members }] : [];
      });
    const slim1 = (g: DupGroup) => ({
        key: g.key, kind: g.kind, title: g.title,
        members: (g.members ?? []).map((m) => {
          const verdict = report.states?.[m.hash];
          const state = verdict?.state ?? m.state ?? 'unknown';
          return {
            hash: m.hash, name: m.name, sizeBytes: m.size ?? null, added: m.added ?? null,
            quality: m.quality?.name ?? null,
            state: DUP_STATES.has(state) ? state : 'unknown',
            reasons: (verdict?.reasons ?? m.reasons ?? []).slice(0, 1),
          };
        }),
      });
    const groups = [...slim(report.movies), ...slim(report.seasons), ...slim(report.names)];
    // The report already knows which releases Radarr/Sonarr use — reuse it for the Broken tab.
    const seenAt = Date.now();
    for (const [hash, v] of Object.entries(report.states ?? {})) if (v.state) inUse.set(hash, { state: v.state, at: seenAt });
    // A season pack shows up in every season's group — count each release once.
    const deletable = [...new Map(groups.flatMap((g) => g.members).filter((m) => m.state === 'no_reference').map((m) => [m.hash, m])).values()];
    // Movies whose in-use file is 20 GB+ while zurg holds a smaller, unused copy of the same film.
    const rawSwaps = groups.filter((g) => g.kind === 'movie' && /^movie:tmdb:\d+$/.test(g.key)).flatMap((g) => {
      const current = g.members.find((m) => m.state === 'referenced' && (m.sizeBytes ?? 0) >= SWAP_MIN_BYTES);
      if (!current) return [];
      const smaller = g.members
        .filter((m) => m.state === 'no_reference' && m.sizeBytes && m.sizeBytes < (current.sizeBytes ?? 0) && m.sizeBytes < SWAP_MIN_BYTES)
        .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
      if (smaller.length === 0) return [];
      return [{ key: g.key, tmdbId: Number(g.key.split(':')[2]), title: g.title, current, smaller }];
    });
    // Only offer a swap Radarr can actually complete: the smaller file must be in the movie
    // folder (zurg's own listing, no TorBox call). Broken releases are reported, not offered.
    const swaps: (typeof rawSwaps[number] & { blocked: null | 'broken' | 'not_placed' })[] = [];
    for (let i = 0; i < rawSwaps.length; i += 5) {
      swaps.push(...await Promise.all(rawSwaps.slice(i, i + 5).map(async (c) => {
        const path = /uses it for .* \((movies\/.+)\)\.?$/.exec(c.current.reasons[0] ?? '')?.[1];
        if (!path) return { ...c, blocked: 'not_placed' as const };
        const folder = path.slice(0, path.lastIndexOf('/'));
        const currentName = path.slice(path.lastIndexOf('/') + 1);
        const res = await checkSwappable(conn, folder, currentName, c.smaller[0].sizeBytes ?? 0, c.smaller[0].name).catch(() => null);
        return { ...c, blocked: res === null ? null : res.ok ? null : res.reason };
      })));
    }
    // How long a full analysis takes here (status.started → report built), for the progress note.
    // zurg rebuilds the report after removals too, so only count the build step when it came
    // straight after the read (else the duration would include unrelated time).
    const startedMs = status?.started ? Date.parse(status.started) : NaN;
    const finishedMs = status?.finished ? Date.parse(status.finished) : NaN;
    const builtMs = report.built_at ? Date.parse(report.built_at) : NaN;
    if (!status?.refreshing && finishedMs > startedMs) {
      lastAnalysisMs = builtMs > finishedMs && builtMs - finishedMs < 5 * 60_000 ? builtMs - startedMs : finishedMs - startedMs;
    }
    return {
      swaps,
      builtAt: report.built_at ?? null,
      refreshing: status?.refreshing ?? false,
      refreshStartedAt: status?.refreshing && status.started ? status.started : null,
      typicalAnalysisMs: lastAnalysisMs,
      blockers: report.blockers ?? [],
      sources: (report.sources ?? []).map((src) => ({ name: src.name, state: src.state, problem: src.problem || null, readAt: src.read_at ?? null })),
      groups,
      summary: { groups: groups.length, deletable: deletable.length, reclaimableBytes: deletable.reduce((n, m) => n + (m.sizeBytes ?? 0), 0) },
    };
  }

  app.get('/zurg/duplicates', async (request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    return getDuplicates(conn, (request.query as { fresh?: string }).fresh === '1');
  });

  // Counts for the cleanup page's tiles and tab badges — all from the caches above.
  app.get('/zurg/cleanup/summary', async (_request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    const [dups, broken, trash] = await Promise.all([
      getDuplicates(conn).catch(() => null),
      listBroken(conn).catch(() => null),
      getTrash(conn).catch(() => null),
    ]);
    const ready = (dups?.swaps ?? []).filter((c) => !c.blocked);
    return {
      swaps: { ready: ready.length, blocked: (dups?.swaps.length ?? 0) - ready.length, savingsBytes: ready.reduce((n, c) => n + Math.max(0, (c.current.sizeBytes ?? 0) - (c.smaller[0].sizeBytes ?? 0)), 0) },
      duplicates: dups ? { groups: dups.summary.groups, unused: dups.summary.deletable, reclaimableBytes: dups.summary.reclaimableBytes, refreshing: dups.refreshing } : null,
      broken: broken ? { count: broken.length } : null,
      trash: trash ? { count: trash.length } : null,
      swapJobs: { active: listSwapJobs().filter((j) => j.state === 'queued' || j.state === 'running').length },
      repairJobs: { active: listRepairJobs().filter((j) => j.state === 'queued' || j.state === 'running').length, paused: repairControl().paused },
    };
  });

  app.post('/zurg/duplicates/refresh', async (_request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    await zurgPost(conn, '/manage/duplicates/refresh', {}, 30_000);
    return { ok: true };
  });

  // Mirrors zurg's own safe path: re-check every selected release against Radarr/Sonarr right
  // now and delete only those still with no reference. Deleted releases go to zurg's trash
  // (restorable for 30 days).
  app.post('/zurg/duplicates/delete', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['hashes'],
        properties: { hashes: { type: 'array' as const, minItems: 1, maxItems: 200, items: { type: 'string' as const, pattern: '^[A-Za-z0-9]{8,64}$' } } },
      },
    },
  }, async (request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    const { hashes } = request.body as { hashes: string[] };
    const check = await zurgPost<{ releases?: { hash: string; name?: string; state?: string }[]; blockers?: string[] }>(conn, '/manage/duplicates/check', { hashes }, 120_000);
    const releases = check.releases ?? [];
    const safe = releases.filter((r) => r.state === 'no_reference').map((r) => r.hash);
    const skipped = releases.filter((r) => r.state !== 'no_reference').map((r) => ({ hash: r.hash, name: r.name ?? '', state: r.state ?? 'unknown' }));
    let deleted = 0;
    if (safe.length > 0) {
      const res = await zurgPost<{ deleted?: number }>(conn, '/manage/bulk-delete', { hashes: safe }, 120_000);
      deleted = res.deleted ?? 0;
      markGone(safe);
    }
    logEvent('info', 'Zurg', `Duplicates cleanup by ${request.user?.email ?? 'admin'}: ${deleted} moved to zurg trash, ${skipped.length} kept after re-check`);
    return { deleted, skipped, blockers: check.blockers ?? [] };
  });

  // Swaps run in a background queue (services/zurg/swapQueue.ts): POST only enqueues, so the
  // admin can queue several and leave the page.
  app.post('/zurg/duplicates/swap', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['tmdbId', 'dropHash', 'keepHash', 'keepSize'],
        properties: {
          tmdbId: { type: 'integer' as const, minimum: 1 },
          dropHash: { type: 'string' as const, pattern: '^[A-Za-z0-9]{8,64}$' },
          keepHash: { type: 'string' as const, pattern: '^[A-Za-z0-9]{8,64}$' },
          keepSize: { type: 'number' as const, minimum: 1 },
          currentSize: { type: 'number' as const, minimum: 0 },
          title: { type: 'string' as const, maxLength: 300 },
        },
      },
    },
  }, async (request, reply) => {
    const b = request.body as { tmdbId: number; dropHash: string; keepHash: string; keepSize: number; currentSize?: number; title?: string };
    const job = enqueueSwap({
      key: `movie:tmdb:${b.tmdbId}`, tmdbId: b.tmdbId, title: b.title || `TMDB ${b.tmdbId}`,
      dropHash: b.dropHash, keepHash: b.keepHash, keepSize: b.keepSize, currentSize: b.currentSize ?? 0,
      by: request.user?.email ?? 'admin',
    });
    return reply.status(202).send({ job });
  });

  app.get('/zurg/swaps', async () => ({ jobs: listSwapJobs() }));

  app.delete('/zurg/swaps/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return cancelSwap(id) ? { ok: true } : reply.status(409).send({ error: 'NOT_QUEUED' });
  });

  app.post('/zurg/swaps/clear', async () => {
    clearFinishedSwaps();
    return { ok: true };
  });

  // ── Broken releases + repair queue (services/zurg/repairQueue.ts) ──────────────────────
  app.get('/zurg/broken', async (_request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    const items = await listBroken(conn);
    // "In use" comes from the cache; anything missing or stale is re-checked in the background
    // (that check takes ~14 s) and the page asks again once `inUsePending` clears.
    const now = Date.now();
    const stale = items.filter((i) => { const v = inUse.get(i.hash); return !v || now - v.at > IN_USE_TTL_MS; });
    refreshInUse(conn, stale.map((i) => i.hash));
    return {
      items: items.map((i) => { const v = inUse.get(i.hash); return { ...i, inUse: v ? v.state === 'referenced' : null }; }),
      inUsePending: stale.length > 0,
    };
  });

  app.post('/zurg/broken/repair', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['hashes'],
        properties: {
          hashes: { type: 'array' as const, minItems: 1, maxItems: 500, items: { type: 'string' as const, pattern: '^[A-Za-z0-9]{8,64}$' } },
          onFail: { type: 'string' as const, enum: ['trash', 'keep'] },
        },
      },
    },
  }, async (request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    const { hashes, onFail } = request.body as { hashes: string[]; onFail?: OnFail };
    const known = new Map((await listBroken(conn)).map((b) => [b.hash, b]));
    // Only releases zurg currently lists as broken are queued; names/sizes come from zurg.
    const items = hashes.flatMap((h) => { const b = known.get(h); return b ? [{ hash: b.hash, name: b.name, sizeBytes: b.sizeBytes }] : []; });
    const jobs = enqueueRepairs(items, onFail ?? 'keep', request.user?.email ?? 'admin');
    return reply.status(202).send({ queued: jobs.length, skipped: hashes.length - items.length });
  });

  app.get('/zurg/repairs', async () => ({ jobs: listRepairJobs(), control: repairControl() }));

  app.post('/zurg/repairs/pause', async () => { pauseRepairs(); return { ok: true }; });
  app.post('/zurg/repairs/resume', async () => { resumeRepairs(); return { ok: true }; });

  app.delete('/zurg/repairs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return cancelRepair(id) ? { ok: true } : reply.status(409).send({ error: 'NOT_QUEUED' });
  });

  app.post('/zurg/repairs/clear', async () => {
    clearFinishedRepairs();
    return { ok: true };
  });

  // ── Library cleanup: trash ───────────────────────────────────────────────────────────────
  app.get('/zurg/trash', async (request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    return { items: await getTrash(conn, (request.query as { fresh?: string }).fresh === '1') };
  });

  app.post('/zurg/trash/:id/:action', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['id', 'action'],
        properties: {
          id: { type: 'string' as const, pattern: '^[A-Za-z0-9-]{8,120}$' },
          action: { type: 'string' as const, enum: ['restore', 'purge'] },
        },
      },
    },
  }, async (request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    const { id, action } = request.params as { id: string; action: 'restore' | 'purge' };
    const msg = await trashAction(conn, `/manage/trash/${id}/${action}`);
    logEvent('info', 'Zurg', `Trash ${action} ${id} by ${request.user?.email ?? 'admin'} → ${msg}`);
    const ok = ['restored', 'readded', 'purged', 'ok'].includes(msg);
    return reply.status(ok ? 200 : 409).send({ ok, result: msg });
  });

  // Purge a chosen set (e.g. one group from the Trash tab). Purging only forgets the entry in
  // zurg — no TorBox call — so it runs straight through.
  app.post('/zurg/trash/purge', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['ids'],
        properties: { ids: { type: 'array' as const, minItems: 1, maxItems: 1000, items: { type: 'string' as const, pattern: '^[A-Za-z0-9-]{8,120}$' } } },
      },
    },
  }, async (request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    const { ids } = request.body as { ids: string[] };
    let purged = 0;
    for (const id of ids) {
      const msg = await trashAction(conn, `/manage/trash/${id}/purge`).catch(() => 'error');
      if (msg === 'purged' || msg === 'ok') purged++;
    }
    logEvent('info', 'Zurg', `Trash: ${purged} of ${ids.length} purged by ${request.user?.email ?? 'admin'}`);
    return { purged, failed: ids.length - purged };
  });

  app.post('/zurg/trash/purge-all', async (request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    const msg = await trashAction(conn, '/manage/trash/purge-all');
    logEvent('info', 'Zurg', `Trash emptied by ${request.user?.email ?? 'admin'} → ${msg}`);
    return { ok: true, result: msg };
  });

  app.post('/zurg/rclone/restart', async (request, reply) => {
    const conn = await getZurgConn();
    if (!conn) return reply.status(400).send({ error: 'ZURG_NOT_CONFIGURED' });
    try {
      await zurgPost(conn, '/rclone/restart', {}, 30_000);
      logEvent('info', 'Zurg', `Mount restart requested by ${request.user?.email ?? 'admin'}`);
      return { ok: true };
    } catch (err) {
      return reply.status(502).send({ error: 'ZURG_ACTION_FAILED', detail: String((err as Error)?.message ?? err).slice(0, 200) });
    }
  });
}
