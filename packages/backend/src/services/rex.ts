import axios from 'axios';
import { getAllServices } from '../utils/services.js';

/**
 * rex — DMM's Plex Media Server emulator, configured in LeMedia as a `plex` service. It speaks
 * the Plex API, so health, now-playing and title lookup use plain PMS endpoints with the
 * server token. rex has no `guid=` filter, so titles are found by search and then confirmed
 * by their TMDB guid — a deep link must never open a different film with a similar name.
 */

export interface RexConn { serviceId: number; name: string; base: string; token: string; machineId: string | null }

export async function getRexConn(): Promise<RexConn | null> {
  const services = await getAllServices('rex');
  const legacy = services.length ? [] : await getAllServices('plex');
  const svc = [...services, ...legacy].find((s) => s.config.url && (s.type === 'rex' || s.config.token));
  if (!svc) return null;
  return {
    serviceId: svc.id,
    name: svc.name,
    base: svc.config.url.replace(/\/+$/, ''),
    token: svc.config.token || '',
    machineId: svc.config.machineId || null,
  };
}

export async function rexGet<T>(conn: RexConn, path: string, timeout = 8000): Promise<T> {
  const { data } = await axios.get<T>(`${conn.base}${path}`, {
    timeout,
    headers: { Accept: 'application/json', 'X-Plex-Token': conn.token },
  });
  return data;
}

interface PlexMetadata {
  ratingKey?: string; type?: string; title?: string; year?: number; grandparentTitle?: string; parentIndex?: number; index?: number;
  duration?: number; viewOffset?: number; Guid?: { id: string }[];
  User?: { title?: string }; Player?: { title?: string; product?: string; state?: string; platform?: string };
  Session?: { bandwidth?: number; location?: string };
  TranscodeSession?: { videoDecision?: string; audioDecision?: string };
  Media?: { videoResolution?: string }[];
}

// ── Health ────────────────────────────────────────────────────────────────────────────────

export async function getRexHealth(conn: RexConn) {
  const started = Date.now();
  const identity = await rexGet<{ MediaContainer?: { version?: string; machineIdentifier?: string; claimed?: boolean } }>(conn, '/identity', 5000).catch(() => null);
  if (!identity) return { reachable: false, name: conn.name };
  const latencyMs = Date.now() - started;

  const sections = await rexGet<{ MediaContainer?: { Directory?: { key: string; title: string; type: string }[] } }>(conn, '/library/sections').catch(() => null);
  const libraries = await Promise.all((sections?.MediaContainer?.Directory ?? []).map(async (d) => {
    const c = await rexGet<{ MediaContainer?: { totalSize?: number; size?: number } }>(conn, `/library/sections/${d.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0`).catch(() => null);
    return { title: d.title, type: d.type, count: c?.MediaContainer?.totalSize ?? c?.MediaContainer?.size ?? null };
  }));

  const sessions = await rexGet<{ MediaContainer?: { Metadata?: PlexMetadata[] } }>(conn, '/status/sessions').catch(() => null);
  const nowPlaying = (sessions?.MediaContainer?.Metadata ?? []).map((m) => ({
    title: m.type === 'episode' && m.grandparentTitle
      ? `${m.grandparentTitle} · S${String(m.parentIndex ?? 0).padStart(2, '0')}E${String(m.index ?? 0).padStart(2, '0')}`
      : `${m.title ?? ''}${m.year ? ` (${m.year})` : ''}`,
    user: m.User?.title ?? null,
    player: m.Player?.product ?? m.Player?.title ?? null,
    state: m.Player?.state ?? null,
    progress: m.duration && m.viewOffset ? Math.min(1, m.viewOffset / m.duration) : null,
    transcoding: !!m.TranscodeSession && (m.TranscodeSession.videoDecision === 'transcode' || m.TranscodeSession.audioDecision === 'transcode'),
    resolution: m.Media?.[0]?.videoResolution ?? null,
    location: m.Session?.location ?? null,
  }));

  // rex-specific and extra PMS reads — each optional, so an older rex still renders.
  const [prefs, sources, recent, accounts, history] = await Promise.all([
    rexGet<{ MediaContainer?: { Setting?: { id: string; value: unknown }[] } }>(conn, '/:/prefs').catch(() => null),
    rexGet<{ sources?: { name?: string; url?: string; features?: string[] }[] }>(conn, '/rex/sources').catch(() => null),
    rexGet<{ MediaContainer?: { Metadata?: (PlexMetadata & { addedAt?: number; parentTitle?: string })[] } }>(conn, '/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=12').catch(() => null),
    rexGet<{ MediaContainer?: { Account?: { id?: number; name?: string }[] } }>(conn, '/accounts').catch(() => null),
    rexGet<{ MediaContainer?: { totalSize?: number; Metadata?: (PlexMetadata & { viewedAt?: number; accountID?: number })[] } }>(conn, '/status/sessions/history/all?sort=viewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=10').catch(() => null),
  ]);
  const friendlyName = prefs?.MediaContainer?.Setting?.find((x) => x.id === 'FriendlyName')?.value;
  const accountName = new Map((accounts?.MediaContainer?.Account ?? []).map((a) => [a.id, a.name]));

  return {
    reachable: true,
    name: conn.name,
    friendlyName: typeof friendlyName === 'string' ? friendlyName : null,
    latencyMs,
    // Source URLs are LAN addresses of the admin's own servers; credentials are never part of them.
    sources: (sources?.sources ?? []).map((src) => ({ name: src.name ?? null, url: src.url ?? null, features: src.features ?? [] })),
    accounts: (accounts?.MediaContainer?.Account ?? []).filter((a) => a.name).map((a) => a.name as string),
    recentlyAdded: (recent?.MediaContainer?.Metadata ?? []).map((m) => ({
      title: m.type === 'season' && m.parentTitle ? `${m.parentTitle} · ${m.title}` : m.type === 'episode' && m.grandparentTitle ? `${m.grandparentTitle} · ${m.title}` : `${m.title ?? ''}${m.year ? ` (${m.year})` : ''}`,
      type: m.type ?? null,
      addedAt: m.addedAt ? new Date(m.addedAt * 1000).toISOString() : null,
    })),
    history: {
      total: history?.MediaContainer?.totalSize ?? 0,
      items: (history?.MediaContainer?.Metadata ?? []).map((m) => ({
        title: m.type === 'episode' && m.grandparentTitle ? `${m.grandparentTitle} · S${String(m.parentIndex ?? 0).padStart(2, '0')}E${String(m.index ?? 0).padStart(2, '0')}` : `${m.title ?? ''}${m.year ? ` (${m.year})` : ''}`,
        user: m.accountID !== undefined ? (accountName.get(m.accountID) ?? null) : null,
        viewedAt: m.viewedAt ? new Date(m.viewedAt * 1000).toISOString() : null,
      })),
    },
    version: identity.MediaContainer?.version ?? null,
    machineId: identity.MediaContainer?.machineIdentifier ?? conn.machineId,
    claimed: identity.MediaContainer?.claimed ?? null,
    libraries,
    nowPlaying,
  };
}

// ── Title lookup (for "Play in Plex") ────────────────────────────────────────────────────

const keyCache = new Map<string, { at: number; key: string | null }>();
const HIT_MS = 24 * 3600_000;
const MISS_MS = 30 * 60_000;

/** rex's ratingKey for a title, confirmed by its tmdb:// guid. Null when rex doesn't have it. */
export async function findRexRatingKey(conn: RexConn, mediaType: 'movie' | 'tv', tmdbId: number, title: string): Promise<string | null> {
  const cacheKey = `${mediaType}:${tmdbId}`;
  const hit = keyCache.get(cacheKey);
  if (hit && Date.now() - hit.at < (hit.key ? HIT_MS : MISS_MS)) return hit.key;

  const wantType = mediaType === 'movie' ? 'movie' : 'show';
  const wantGuid = `tmdb://${tmdbId}`;
  let found: string | null = null;
  try {
    const res = await rexGet<{ MediaContainer?: { Hub?: { Metadata?: PlexMetadata[] }[] } }>(
      conn, `/hubs/search?query=${encodeURIComponent(title)}&limit=10`,
    );
    const candidates = (res.MediaContainer?.Hub ?? []).flatMap((h) => h.Metadata ?? [])
      .filter((m) => m.type === wantType && m.ratingKey)
      .slice(0, 6);
    for (const c of candidates) {
      const guids = c.Guid?.length ? c.Guid : (await rexGet<{ MediaContainer?: { Metadata?: PlexMetadata[] } }>(
        conn, `/library/metadata/${c.ratingKey}?includeGuids=1`,
      ).catch(() => null))?.MediaContainer?.Metadata?.[0]?.Guid;
      if (guids?.some((g) => g.id === wantGuid)) { found = c.ratingKey!; break; }
    }
  } catch {
    found = null;
  }
  keyCache.set(cacheKey, { at: Date.now(), key: found });
  return found;
}
