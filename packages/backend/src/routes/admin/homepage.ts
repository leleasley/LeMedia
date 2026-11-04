import type { FastifyInstance } from 'fastify';
import { getAppSettings, patchAppSettings } from '../../utils/appSettings.js';
import { getTmdbApi } from '../../services/tmdb.js';
import { buildDiscoverParams, type DiscoverQuery } from '../../utils/tmdbDiscoverQuery.js';

// ── In-memory cache for public layout endpoint ─────────────────────────────
let homepageLayoutCache: { data: unknown; at: number } | null = null;
const LAYOUT_CACHE_TTL = 60_000; // 1 minute

export function invalidateHomepageLayoutCache(): void {
  homepageLayoutCache = null;
}

export function getDefaultLayout() {
  return [
    { id: 'hero', type: 'builtin', enabled: true, title: 'Hero', builtinKey: 'hero' },
    { id: 'recently_added', type: 'builtin', enabled: true, title: 'home.recently_added', builtinKey: 'recently_added' },
    { id: 'trending', type: 'builtin', enabled: true, title: 'home.trending_week', builtinKey: 'trending', size: 'large' },
    { id: 'popular_movies', type: 'builtin', enabled: true, title: 'home.popular_movies', builtinKey: 'popular_movies' },
    { id: 'popular_tv', type: 'builtin', enabled: true, title: 'home.popular_series', builtinKey: 'popular_tv' },
    { id: 'trending_anime', type: 'builtin', enabled: true, title: 'home.trending_anime', builtinKey: 'trending_anime' },
    { id: 'genres', type: 'builtin', enabled: true, title: 'home.genres', builtinKey: 'genres' },
    { id: 'streaming', type: 'builtin', enabled: true, title: 'home.streaming', builtinKey: 'streaming' },
    { id: 'upcoming', type: 'builtin', enabled: true, title: 'home.coming_soon', builtinKey: 'upcoming' },
    { id: 'missing_movies', type: 'builtin', enabled: false, title: 'home.missing_movies', builtinKey: 'missing_movies' },
    { id: 'missing_tv', type: 'builtin', enabled: false, title: 'home.missing_tv', builtinKey: 'missing_tv' },
  ];
}

export async function getHomepageLayout(): Promise<unknown> {
  const now = Date.now();
  if (homepageLayoutCache && now - homepageLayoutCache.at < LAYOUT_CACHE_TTL) {
    return homepageLayoutCache.data;
  }
  const settings = await getAppSettings();
  const stored = settings?.homepageLayout ? JSON.parse(settings.homepageLayout) : null;
  const layout = mergeNewDefaults(Array.isArray(stored) ? stored : getDefaultLayout());
  homepageLayoutCache = { data: layout, at: now };
  return layout;
}

/** Append default builtins missing from a stored layout (e.g. `streaming` added after the
 *  install). Matched by builtinKey (or id) so renames don't duplicate. A section the admin
 *  disabled stays disabled — only a full delete re-triggers the merge, by design: disable,
 *  don't delete, to hide a row permanently. Inserted after `genres`, else at the end. */
function mergeNewDefaults(stored: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const keyOf = (s: Record<string, unknown>) => (s.builtinKey as string | undefined) ?? (s.id as string);
  const present = new Set(stored.map(keyOf));
  const next = [...stored];
  for (const def of getDefaultLayout() as Array<Record<string, unknown>>) {
    if (present.has(keyOf(def))) continue;
    const genresIdx = next.findIndex((s) => s.builtinKey === 'genres');
    next.splice(genresIdx >= 0 ? genresIdx + 1 : next.length, 0, { ...def });
  }
  return next;
}

/** Missing wanted items from Radarr/Sonarr, enriched with TMDB posters (public TMDB fields only).
 *  Shared by the homepage "Missing" rows (any signed-in user) and the admin route. Cached 10 min:
 *  each call is an *arr read plus up to 20 TMDB lookups. */
const missingCache = new Map<string, { at: number; value: { results: unknown[]; total: number } }>();
export async function getMissingWanted(type?: string): Promise<{ results: unknown[]; total: number }> {
  const key = type === 'tv' ? 'tv' : 'movie';
  const hit = missingCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  const value = await computeMissingWanted(key);
  missingCache.set(key, { at: Date.now(), value });
  return value;
}

async function computeMissingWanted(type: string): Promise<{ results: unknown[]; total: number }> {
  const mediaType = type === 'tv' ? 'tv' : 'movie';
  const serviceType = mediaType === 'movie' ? 'radarr' : 'sonarr';
  const { getServiceConfig } = await import('../../utils/services.js');
  const { createArrClient } = await import('../../providers/index.js');
  const { getTmdbApi } = await import('../../services/tmdb.js');
  const cfg = await getServiceConfig(serviceType);
  if (!cfg) return { results: [], total: 0 };
  try {
    const client = createArrClient(serviceType, cfg) as unknown as { api: { get: (url: string, opts?: unknown) => Promise<{ data: unknown }> } };
    const { data } = await client.api.get('/wanted/missing', { params: { page: 1, pageSize: 20, sortDirection: 'descending', sortKey: mediaType === 'movie' ? 'movieMetadata.sortTitle' : 'airDateUtc', includeMovie: true, includeSeries: true, includeEpisode: true } });
    const records = (data as { records?: unknown[] })?.records ?? (Array.isArray(data) ? data : []);
    const slice = records.slice(0, 20) as Array<Record<string, unknown>>;
    const tmdb = getTmdbApi();
    if (mediaType === 'movie') {
      const enriched = await Promise.all(slice.map(async (r) => {
        const m = (r as Record<string, unknown>).movie as Record<string, unknown> | undefined;
        const tmdbId = Number((r as Record<string, unknown>).tmdbId ?? m?.tmdbId ?? 0);
        if (!tmdbId) return null;
        try {
          const { data: detail } = await tmdb.get(`/movie/${tmdbId}`) as { data: Record<string, unknown> };
          return { id: tmdbId, title: detail.title ?? (r as Record<string, unknown>).title ?? m?.title ?? 'Unknown', poster_path: detail.poster_path ?? null, backdrop_path: detail.backdrop_path ?? null, media_type: 'movie', vote_average: detail.vote_average ?? 0, release_date: detail.release_date ?? null };
        } catch { return null; }
      }));
      const results = enriched.filter(Boolean);
      return { results, total: (data as { totalRecords?: number })?.totalRecords ?? results.length };
    } else {
      // Sonarr missing episodes — group by series and enrich via TMDB find by tvdbId or search
      const seriesMap = new Map<number, Record<string, unknown>>();
      for (const r of slice) {
        const series = (r as Record<string, unknown>).series as Record<string, unknown> | undefined;
        if (series?.tvdbId) {
          const tvdbId = Number(series.tvdbId);
          if (!seriesMap.has(tvdbId)) seriesMap.set(tvdbId, series);
        }
      }
      const enriched = await Promise.all([...seriesMap.values()].slice(0, 20).map(async (series) => {
        const tvdbId = Number(series.tvdbId);
        const title = String(series.title ?? 'Unknown');
        try {
          // Use TMDB find by tvdbId to get the show
          const { data: findData } = await tmdb.get(`/find/${tvdbId}`, { params: { external_source: 'tvdb_id' } }) as { data: { tv_results?: Array<Record<string, unknown>> } };
          const search = findData;
          const hit = search.tv_results?.[0];
          if (hit) return { id: hit.id, name: hit.name ?? title, poster_path: hit.poster_path ?? null, backdrop_path: hit.backdrop_path ?? null, media_type: 'tv', vote_average: hit.vote_average ?? 0, first_air_date: hit.first_air_date ?? null };
        } catch {}
        // Fallback: search by title
        try {
          const { data: res } = await tmdb.get('/search/tv', { params: { query: title } }) as { data: { results?: Array<Record<string, unknown>> } };
          const hit = res.results?.[0];
          if (hit) return { id: hit.id, name: hit.name ?? title, poster_path: hit.poster_path ?? null, backdrop_path: hit.backdrop_path ?? null, media_type: 'tv', vote_average: hit.vote_average ?? 0, first_air_date: hit.first_air_date ?? null };
        } catch {}
        return null;
      }));
      const results = enriched.filter(Boolean);
      return { results, total: results.length };
    }
  } catch {
    return { results: [], total: 0 };
  }
}

export async function homepageRoutes(app: FastifyInstance) {
  // GET /homepage — Returns the current layout (stored + any new defaults merged in)
  app.get('/homepage', async () => {
    return getHomepageLayout();
  });

  // PUT /homepage — Save layout (receives JSON array or { sections, reset })
  app.put('/homepage', async (request, reply) => {
    const body = request.body as { sections?: any[]; reset?: boolean } | any[];
    const sections = Array.isArray(body) ? body : body.sections;

    // Handle reset
    if (!Array.isArray(body) && (body as any).reset) {
      await patchAppSettings({ homepageLayout: null });
      homepageLayoutCache = null;
      return { ok: true, sections: getDefaultLayout() };
    }

    if (!Array.isArray(sections)) {
      return reply.status(400).send({ error: 'Layout must be an array or { sections: [...] }' });
    }

    // Basic validation: each item must have id, type, enabled, title
    for (const s of sections) {
      if (!s.id || !s.type || typeof s.enabled !== 'boolean' || !s.title) {
        return reply.status(400).send({ error: 'Each section must have id, type, enabled, and title' });
      }
    }
    await patchAppSettings({ homepageLayout: JSON.stringify(sections) });
    // Invalidate the public layout cache
    invalidateHomepageLayoutCache();
    return { ok: true };
  });

  // GET /homepage/missing — Missing wanted items from Radarr/Sonarr, enriched with TMDB posters
  app.get('/homepage/missing', async (request) => {
    const { type } = request.query as { type?: string };
    return getMissingWanted(type);
  });

  // POST /homepage/preview — Preview a TMDB discover query (returns results)
  app.post('/homepage/preview', async (request, reply) => {
    const query = request.body as DiscoverQuery;

    const params = buildDiscoverParams(query);
    params.set('page', '1');

    // Static-path selector — no user input in the URL (prevents SSRF / CodeQL alert).
    const discoverPath = query.mediaType === 'movie' ? '/discover/movie' : query.mediaType === 'tv' ? '/discover/tv' : null;
    if (!discoverPath) {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const api = getTmdbApi();
    const { data } = await api.get(discoverPath, { params: Object.fromEntries(params) });
    return data;
  });
}
