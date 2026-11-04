/**
 * List sources for Admin → Lists: turn a pasted link into a fixed, allow-listed API call and a
 * normalised item list. Ported from media-heal's dmm_lists.py so both behave identically.
 *
 * Only the URL shapes below are accepted. Each derives its own endpoint; a browser-supplied URL is
 * never fetched as-is (SSRF guard). Responses are size-capped and redirects are refused.
 */
import { getTmdbApi } from '../tmdb.js';

export type ItemType = 'movie' | 'show';

export interface ListItem {
  key: string;              // "<type>:<namespace>:<id>", e.g. "movie:tmdb:603"
  mediaType: ItemType;
  title: string;
  year: number;
  ids: { tmdb?: number | string; tvdb?: number | string; imdb?: string; trakt?: number | string };
  overview: string;
  genres: string[];
  originalLanguage: string;
  feeds: string[];
  appearances: number;
  rank: number;
  // Filled in by the preview:
  existing?: boolean;
  blocked?: boolean;
  blockReason?: string;
}

export interface ListSource {
  url: string;              // canonical link (also the subscription key)
  provider: string;         // dmm | trakt | trakt-chart | trakt-watchlist | trakt-genre | mdblist | mdblist-top | mdblist-search | tmdb-list | tmdb-chart | tmdb-trending | cinemeta
  providerName: string;
  label: string;
  mediaType: ItemType | 'mixed';
  apiUrl: string;
  userSlug?: string;
  listSlug?: string;
  term?: string;
}

export interface SourceKeys { traktClientId?: string | null; mdblistApiKey?: string | null }

const DMM_HOSTS = new Set(['debridmediamanager.com', 'www.debridmediamanager.com']);
const DMM_ORIGIN = 'https://debridmediamanager.com';
const CINEMETA_HOSTS = new Set(['v3-cinemeta.strem.io', 'cinemeta-catalogs.strem.io']);
const CINEMETA_ORIGIN = 'https://cinemeta-catalogs.strem.io/top';
const CINEMETA_PAGE = 50;
const CINEMETA_MAX_ITEMS = 500;
const TMDB_HOSTS = new Set(['themoviedb.org', 'www.themoviedb.org']);
const TMDB_MAX_ITEMS = 1000;
const TMDB_MAX_SHOW_LOOKUPS = 300;
const MDBLIST_HOSTS = new Set(['mdblist.com', 'www.mdblist.com']);
const MDBLIST_ORIGIN = 'https://mdblist.com';
const MDBLIST_API_ORIGIN = 'https://api.mdblist.com';
const MDBLIST_SEARCH_ORIGIN = 'https://mdblist.com/api';
const MDBLIST_API_PAGE = 1000;
const MDBLIST_BROWSE_LISTS = 4;
const MDBLIST_BROWSE_ITEMS = 1000;
const TRAKT_API_ORIGIN = 'https://api.trakt.tv';
const RADARR_LIST_ORIGIN = 'https://api.radarr.video';
const TRAKT_GENRE_LIMIT = 20;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_ITEMS = 2000;

const SLUG_RE = /^[A-Za-z0-9_-]+$/;
const BROWSE_TERM_RE = /^[a-z0-9][a-z0-9-]*$/;
const YEAR_RE = /(19|20)\d{2}/;

const DMM_GENRE_SLUGS = new Set([
  'action', 'adventure', 'animation', 'anime', 'comedy', 'crime', 'documentary', 'donghua', 'drama',
  'family', 'fantasy', 'history', 'holiday', 'horror', 'music', 'musical', 'mystery', 'none', 'romance',
  'science-fiction', 'short', 'sporting-event', 'superhero', 'suspense', 'thriller', 'war', 'western',
]);

// TMDB genre ids → names the content filters read ("Children", "Talk Show", ...).
const TMDB_MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
const TMDB_TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 10762: 'Children', 9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
  10766: 'Soap', 10767: 'Talk Show', 10768: 'War & Politics', 37: 'Western',
};
const TMDB_CHARTS = new Set([
  'movie/popular', 'movie/top_rated', 'movie/upcoming', 'movie/now_playing',
  'tv/popular', 'tv/top_rated', 'tv/on_the_air', 'tv/airing_today',
]);

export class ListError extends Error {}

/** "amazon-prime-movies" → "Amazon Prime Movies" (the fallback when a site won't give its title). */
export function humanize(slug: string): string {
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs']);
  return slug.replace(/[-_]+/g, ' ').trim().split(/\s+/)
    .map((w, i) => (/^\d/.test(w) || (i > 0 && small.has(w.toLowerCase())) ? w.toLowerCase() : /^(tv|uk|us|4k|hd|imdb|tmdb|mcu|dc)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

const isSlugish = (s: string) => /^[A-Za-z0-9]+$/.test(s.replaceAll('-', '').replaceAll('_', ''));

/** Identify a supported list link and derive its fixed API endpoint. Throws a readable ListError. */
export function parseListUrl(value: string): ListSource {
  const raw = String(value ?? '').trim();
  if (!raw) throw new ListError('Enter a list link');
  let u: URL;
  try { u = new URL(raw); } catch { throw new ListError('That is not a valid link'); }
  if (u.protocol !== 'https:') throw new ListError('List links must use HTTPS');
  if (u.username || u.password || (u.port && u.port !== '443')) throw new ListError('List links cannot include credentials or a custom port');
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  const lower = parts.map((p) => p.toLowerCase());

  if (host === 'trakt.tv' || host === 'www.trakt.tv') {
    if (parts.length === 4 && lower[0] === 'users' && lower[2] === 'lists' && isSlugish(parts[1]) && isSlugish(parts[3])) {
      const [, user, , list] = parts;
      return { url: `https://trakt.tv/users/${user}/lists/${list}`, provider: 'trakt', providerName: 'Trakt', label: humanize(list),
        mediaType: 'mixed', apiUrl: `${TRAKT_API_ORIGIN}/users/${encodeURIComponent(user)}/lists/${encodeURIComponent(list)}/items`, userSlug: user, listSlug: list };
    }
    if (parts.length === 3 && lower[0] === 'users' && lower[2] === 'watchlist' && isSlugish(parts[1])) {
      const user = parts[1];
      return { url: `https://trakt.tv/users/${user}/watchlist`, provider: 'trakt-watchlist', providerName: 'Trakt', label: `${user}'s Trakt watchlist`,
        mediaType: 'mixed', apiUrl: `${TRAKT_API_ORIGIN}/users/${encodeURIComponent(user)}/watchlist`, userSlug: user };
    }
    if (parts.length === 2 && (lower[0] === 'movies' || lower[0] === 'shows') && ['trending', 'popular', 'anticipated', 'boxoffice'].includes(lower[1])) {
      if (lower[0] === 'shows' && lower[1] === 'boxoffice') throw new ListError('Trakt boxoffice is movies only; try https://trakt.tv/movies/boxoffice');
      return { url: `https://trakt.tv/${lower[0]}/${lower[1]}`, provider: 'trakt-chart', providerName: 'Trakt', label: `${lower[1] === 'boxoffice' ? 'Box office' : humanize(lower[1])} ${lower[0]} on Trakt`,
        mediaType: lower[0] === 'movies' ? 'movie' : 'show', apiUrl: `${TRAKT_API_ORIGIN}/${lower[0]}/${lower[1]}` };
    }
    throw new ListError('Trakt detected: paste a public list (https://trakt.tv/users/<user>/lists/<list>), a watchlist (https://trakt.tv/users/<user>/watchlist) or a chart (https://trakt.tv/movies/trending)');
  }

  if (MDBLIST_HOSTS.has(host)) {
    if (parts.length === 3 && lower[0] === 'lists' && SLUG_RE.test(parts[1]) && SLUG_RE.test(parts[2])) {
      const [, owner, list] = parts;
      const canonical = `${MDBLIST_ORIGIN}/lists/${owner}/${list}`;
      return { url: canonical, provider: 'mdblist', providerName: 'MDBList', label: humanize(list), mediaType: 'mixed',
        apiUrl: `${canonical}/json`, userSlug: owner, listSlug: list };
    }
    throw new ListError('MDBList detected: paste a public list link like https://mdblist.com/lists/<user>/<list>');
  }

  if (CINEMETA_HOSTS.has(host)) {
    let media: string | null = null;
    if (parts.length === 4 && parts[0] === 'top' && parts[1] === 'catalog' && ['movie', 'series'].includes(parts[2]) && parts[3] === 'top.json') media = parts[2];
    else if (parts.length === 3 && parts[0] === 'catalog' && ['movie', 'series'].includes(parts[1]) && parts[2] === 'top.json') media = parts[1];
    if (!media) throw new ListError('Stremio Cinemeta links look like https://v3-cinemeta.strem.io/catalog/movie/top.json');
    return { url: `https://v3-cinemeta.strem.io/catalog/${media}/top.json`, provider: 'cinemeta', providerName: 'Stremio',
      label: media === 'movie' ? 'Cinemeta popular movies' : 'Cinemeta popular series', mediaType: media === 'movie' ? 'movie' : 'show',
      apiUrl: `${CINEMETA_ORIGIN}/catalog/${media}/top.json` };
  }

  if (TMDB_HOSTS.has(host)) {
    if (parts.length >= 2 && lower[0] === 'list' && /^\d+$/.test(parts[1].split('-')[0])) {
      const id = parts[1].split('-')[0];
      return { url: `https://www.themoviedb.org/list/${id}`, provider: 'tmdb-list', providerName: 'TMDB', label: `TMDB list ${id}`, mediaType: 'mixed', apiUrl: `/list/${id}`, term: id };
    }
    if (parts.length === 3 && lower[0] === 'trending' && ['all', 'movie', 'tv'].includes(lower[1]) && ['day', 'week'].includes(lower[2])) {
      const [, scope, window] = lower;
      return { url: `https://www.themoviedb.org/trending/${scope}/${window}`, provider: 'tmdb-trending', providerName: 'TMDB', label: `TMDB trending ${scope} (${window})`,
        mediaType: scope === 'movie' ? 'movie' : scope === 'tv' ? 'show' : 'mixed', apiUrl: `/trending/${scope}/${window}`, term: scope };
    }
    if (parts.length === 2 && TMDB_CHARTS.has(`${lower[0]}/${lower[1]}`)) {
      const [media, chart] = lower;
      return { url: `https://www.themoviedb.org/${media}/${chart}`, provider: 'tmdb-chart', providerName: 'TMDB', label: `TMDB ${chart.replaceAll('_', ' ')} ${media === 'movie' ? 'movies' : 'TV'}`,
        mediaType: media === 'movie' ? 'movie' : 'show', apiUrl: `/${media}/${chart}`, term: chart };
    }
    throw new ListError('TMDB detected: paste a list (https://www.themoviedb.org/list/<id>), a chart (https://www.themoviedb.org/movie/top_rated) or trending (https://www.themoviedb.org/trending/movie/week)');
  }

  if (host === 'letterboxd.com' || host === 'www.letterboxd.com') throw new ListError('Letterboxd blocks servers from reading its pages; add the titles to a handmade list instead');
  if (host === 'imdb.com' || host === 'www.imdb.com' || host === 'm.imdb.com') {
    // IMDb blocks servers, so these are read through Radarr's own list service (what Radarr's
    // "IMDb Lists" import uses): the Top 250, the popular chart, ls… lists and ur… watchlists.
    let id = '';
    let label = '';
    if (lower[0] === 'chart' && lower[1] === 'top') { id = 'top250'; label = 'IMDb Top 250'; }
    else if (lower[0] === 'chart' && lower[1] === 'moviemeter') { id = 'popular'; label = 'IMDb most popular movies'; }
    else if (lower[0] === 'list' && /^ls\d+$/.test(lower[1] ?? '')) { id = lower[1]; label = `IMDb list ${id}`; }
    else if (lower[0] === 'user' && /^ur\d+$/.test(lower[1] ?? '')) { id = lower[1]; label = `IMDb watchlist ${id}`; }
    if (!id) throw new ListError('IMDb links supported: the Top 250 (imdb.com/chart/top), the popular chart (imdb.com/chart/moviemeter), lists (imdb.com/list/ls…) and watchlists (imdb.com/user/ur…/watchlist). Movies only.');
    const canonical = id === 'top250' ? 'https://www.imdb.com/chart/top' : id === 'popular' ? 'https://www.imdb.com/chart/moviemeter'
      : id.startsWith('ls') ? `https://www.imdb.com/list/${id}` : `https://www.imdb.com/user/${id}/watchlist`;
    return { url: canonical, provider: 'imdb', providerName: 'IMDb', label, mediaType: 'movie', apiUrl: `${RADARR_LIST_ORIGIN}/v1/list/imdb/${id}`, term: id };
  }
  if (!DMM_HOSTS.has(host)) throw new ListError('List site not recognised. Supported: Debrid Media Manager, Trakt, MDBList, TMDB, IMDb charts and lists, and Stremio Cinemeta');

  const path = u.pathname.replace(/\/+$/, '').toLowerCase();
  if (path === '/trakt/shows' || path === '/trakt/movies') {
    const browse = path.split('/').pop()!;
    return { url: `${DMM_ORIGIN}${path}`, provider: 'dmm', providerName: 'Debrid Media Manager', label: browse === 'shows' ? 'DMM trending shows' : 'DMM trending movies',
      mediaType: browse === 'shows' ? 'show' : 'movie', apiUrl: `${DMM_ORIGIN}/api/info/trakt?browse=${browse}` };
  }
  if (path === '/browse' || path === '/browse/all') {
    return { url: `${DMM_ORIGIN}/browse`, provider: 'mdblist-top', providerName: 'MDBList', label: 'DMM top lists', mediaType: 'mixed', apiUrl: '', term: 'top' };
  }
  if (path === '/browse/genre') throw new ListError('DMM genre links need a genre, like https://debridmediamanager.com/browse/genre/horror');
  if (path.startsWith('/browse/genre/')) {
    const slug = path.split('/').pop()!;
    if (!BROWSE_TERM_RE.test(slug) || !DMM_GENRE_SLUGS.has(slug)) throw new ListError(`Unknown DMM genre. Valid: ${[...DMM_GENRE_SLUGS].sort().join(', ')}`);
    return { url: `${DMM_ORIGIN}/browse/genre/${slug}`, provider: 'trakt-genre', providerName: 'Trakt', label: `${humanize(slug)} on DMM`, mediaType: 'mixed', apiUrl: '', term: slug };
  }
  if (path.startsWith('/browse/')) {
    const term = path.split('/').pop()!;
    if (!BROWSE_TERM_RE.test(term)) throw new ListError('DMM browse links look like https://debridmediamanager.com/browse/mindfuck');
    return { url: `${DMM_ORIGIN}/browse/${term}`, provider: 'mdblist-search', providerName: 'MDBList', label: `${humanize(term)} on DMM`, mediaType: 'mixed', apiUrl: '', term };
  }
  if (path.startsWith('/trakt/mylists')) throw new ListError('DMM "My Lists" are private to your browser; use the public DMM shows or movies link');
  throw new ListError('Supported DMM links end in /trakt/shows, /trakt/movies or /browse/<topic>');
}

// ─── HTTP ────────────────────────────────────────────────────────────

async function getJson(url: string, name: string, headers: Record<string, string> = {}, opts: { anyType?: boolean; notFound?: string; badKey?: string; maxBytes?: number } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'LeMedia/1.0', ...headers },
      redirect: 'manual',
      signal: AbortSignal.timeout(35_000),
    });
  } catch (err) {
    throw new ListError(`Could not reach ${name}: ${(err as Error).message}`);
  }
  if (res.status === 404 && opts.notFound) throw new ListError(opts.notFound);
  if ((res.status === 401 || res.status === 403) && opts.badKey) throw new ListError(opts.badKey);
  if (res.status >= 300) throw new ListError(`${name} answered HTTP ${res.status}`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!opts.anyType && type !== 'application/json') throw new ListError(`${name} returned ${type || 'no content type'}, expected JSON`);
  const max = opts.maxBytes ?? MAX_RESPONSE_BYTES;
  const tooBig = `${name} response is over the ${Math.round(max / 1048576)} MB safety limit`;
  if (Number(res.headers.get('content-length') ?? 0) > max) throw new ListError(tooBig);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > max) throw new ListError(tooBig);
  try { return JSON.parse(new TextDecoder().decode(buf)); } catch { throw new ListError(`${name} returned invalid JSON`); }
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (v == null ? '' : String(v)).trim();
const yearOf = (v: unknown) => { const m = YEAR_RE.exec(str(v)); return m ? Number(m[0]) : 0; };

// ─── Identity ────────────────────────────────────────────────────────

/** Only identifiers the target *arr resolves exactly. A show with only a TMDB/Trakt id would need
 *  a fuzzy title lookup, which this importer refuses. */
function identity(type: ItemType, ids: ListItem['ids']): [string, string] | null {
  const order = type === 'show' ? (['tvdb', 'imdb'] as const) : (['tmdb', 'imdb'] as const);
  for (const ns of order) {
    const v = ids[ns];
    if (v != null && v !== '') return [ns, String(v)];
  }
  return null;
}

class Collector {
  private items = new Map<string, ListItem>();
  add(type: ItemType, ids: ListItem['ids'], fields: { title: string; year?: number; overview?: string; genres?: string[]; lang?: string; feed: string }) {
    const id = identity(type, ids);
    const title = fields.title.trim();
    if (!id || !title) return;
    const key = `${type}:${id[0]}:${id[1]}`;
    const prev = this.items.get(key);
    if (prev) {
      prev.appearances += 1;
      if (!prev.feeds.includes(fields.feed)) prev.feeds.push(fields.feed);
      return;
    }
    this.items.set(key, {
      key, mediaType: type, title: title.slice(0, 300), year: fields.year ?? 0, ids,
      overview: (fields.overview ?? '').slice(0, 320), genres: fields.genres ?? [],
      originalLanguage: (fields.lang ?? '').trim(), feeds: [fields.feed], appearances: 1, rank: this.items.size,
    });
  }
  list() { return [...this.items.values()]; }
}

const cleanGenres = (g: unknown) => (Array.isArray(g) ? g : []).map((x) => str(x).replaceAll('-', ' ')).filter(Boolean);

function pickIds(media: Record<string, any>): ListItem['ids'] {
  const ids = isObj(media.ids) ? media.ids : {};
  const out: ListItem['ids'] = {};
  for (const k of ['tmdb', 'tvdb', 'imdb', 'trakt'] as const) {
    const v = ids[k];
    if (v != null && v !== '' && (typeof v === 'string' || typeof v === 'number')) (out as any)[k] = v;
  }
  return out;
}

// ─── DMM / Trakt ─────────────────────────────────────────────────────

/** DMM's /api/info/trakt payload: categories → feeds → rows of Trakt objects. */
function normalizeDmm(payload: unknown, expected: ItemType): ListItem[] {
  if (!isObj(payload)) throw new ListError('DMM returned an unexpected response');
  const actual = str(payload.mediaType).toLowerCase();
  if (actual !== expected) throw new ListError(`DMM returned ${actual || 'unknown'} data for a ${expected} link`);
  if (!Array.isArray(payload.categories)) throw new ListError('DMM response had no categories');
  const c = new Collector();
  for (const cat of payload.categories) {
    if (!isObj(cat) || !isObj(cat.results)) continue;
    for (const [feed, rows] of Object.entries(cat.results)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!isObj(row)) continue;
        const media = isObj(row[expected]) ? row[expected] : row;
        c.add(expected, pickIds(media), { title: str(media.title), year: Number(media.year) || 0, overview: str(media.overview),
          genres: cleanGenres(media.genres), lang: str(media.language), feed: String(feed).slice(0, 100) });
      }
    }
  }
  return c.list();
}

function normalizeTrakt(rows: unknown[], feed: string): ListItem[] {
  const c = new Collector();
  for (const type of ['show', 'movie'] as const) {
    for (const row of rows) {
      if (!isObj(row) || !isObj(row[type])) continue;
      const m = row[type];
      c.add(type, pickIds(m), { title: str(m.title), year: Number(m.year) || 0, overview: str(m.overview), genres: cleanGenres(m.genres), lang: str(m.language), feed });
    }
  }
  return c.list();
}

function traktHeaders(clientId: string | null | undefined) {
  if (!clientId) throw new ListError('This link needs a Trakt client ID. Add one under Lists → Settings (free at https://trakt.tv/oauth/applications)');
  return { 'trakt-api-version': '2', 'trakt-api-key': clientId, 'Content-Type': 'application/json' };
}
const TRAKT_BAD_KEY = 'Trakt rejected the client ID; check it under Lists → Settings';

async function fetchTraktList(src: ListSource, clientId?: string | null) {
  const headers = traktHeaders(clientId);
  const rows: unknown[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await getJson(`${src.apiUrl}?page=${page}&limit=100&extended=full`, 'Trakt', headers, { anyType: true, badKey: TRAKT_BAD_KEY, notFound: 'Trakt list not found (is it public?)' });
    if (!Array.isArray(data)) throw new ListError('Trakt returned an unexpected list response');
    rows.push(...data);
    if (data.length < 100) return rows;
  }
  throw new ListError('Trakt list is over the 2,000 item safety limit');
}

async function fetchTraktGenre(slug: string, clientId?: string | null) {
  const headers = traktHeaders(clientId);
  const rows: unknown[] = [];
  for (const [endpoint, media] of [['movies', 'movie'], ['shows', 'show']] as const) {
    for (const kind of ['trending', 'popular']) {
      const data = await getJson(`${TRAKT_API_ORIGIN}/${endpoint}/${kind}?genres=${encodeURIComponent(slug)}&limit=${TRAKT_GENRE_LIMIT}&extended=full`, 'Trakt', headers, { anyType: true, badKey: TRAKT_BAD_KEY });
      if (!Array.isArray(data)) throw new ListError('Trakt returned an unexpected genre response');
      for (const row of data) {
        if (!isObj(row)) continue;
        rows.push(isObj(row[media]) ? row : { [media]: row });
      }
    }
  }
  return rows;
}

async function fetchTraktChart(src: ListSource, clientId?: string | null) {
  const data = await getJson(`${src.apiUrl}?limit=50&extended=full`, 'Trakt', traktHeaders(clientId), { anyType: true, badKey: TRAKT_BAD_KEY });
  if (!Array.isArray(data)) throw new ListError('Trakt returned an unexpected chart response');
  // Popular charts return bare objects; the rest wrap them as { movie } / { show }.
  const media = src.mediaType === 'movie' ? 'movie' : 'show';
  return data.filter(isObj).map((row) => (isObj(row[media]) ? row : { [media]: row }));
}

async function fetchTraktWatchlist(src: ListSource, clientId?: string | null) {
  const headers = traktHeaders(clientId);
  const rows: unknown[] = [];
  for (const media of ['movies', 'shows']) {
    const data = await getJson(`${src.apiUrl}/${media}?extended=full`, 'Trakt', headers, { anyType: true, badKey: TRAKT_BAD_KEY, notFound: 'Trakt user or watchlist not found (private profiles cannot be read)' });
    if (!Array.isArray(data)) throw new ListError('Trakt returned an unexpected watchlist response');
    rows.push(...data);
  }
  return rows;
}

// ─── MDBList ─────────────────────────────────────────────────────────

const MDBLIST_TYPES: Record<string, ItemType> = { show: 'show', tv: 'show', series: 'show', movie: 'movie', film: 'movie' };
const MDBLIST_ID_FIELDS: Record<'imdb' | 'tvdb' | 'tmdb' | 'trakt', string[]> = {
  imdb: ['imdb_id', 'imdb'], tvdb: ['tvdb_id', 'tvdbid', 'tvdb'], tmdb: ['tmdb_id', 'tmdb'], trakt: ['trakt_id', 'trakt'],
};

function normalizeMdblist(payload: unknown, feed: string): ListItem[] {
  let rows: unknown[] = [];
  if (Array.isArray(payload)) rows = payload;
  else if (isObj(payload)) {
    for (const k of ['movies', 'shows']) if (Array.isArray(payload[k])) rows.push(...payload[k]);
    if (!rows.length && Array.isArray(payload.items)) rows = payload.items;
  }
  const c = new Collector();
  for (const row of rows) {
    if (!isObj(row)) continue;
    const type = MDBLIST_TYPES[str(row.mediatype ?? row.media_type).toLowerCase()];
    if (!type) continue;
    const nested = isObj(row.ids) ? row.ids : {};
    const ids: ListItem['ids'] = {};
    for (const [name, fields] of Object.entries(MDBLIST_ID_FIELDS)) {
      const v = fields.map((f) => row[f]).find((x) => x != null && x !== '') ?? fields.map((f) => nested[f]).find((x) => x != null && x !== '');
      if (v != null && v !== '') (ids as any)[name] = v;
    }
    c.add(type, ids, { title: str(row.title), year: Number(row.release_year ?? row.year) || 0, overview: str(row.description ?? row.overview),
      genres: cleanGenres(row.genres), lang: str(row.language ?? row.spoken_language ?? row.original_language), feed });
  }
  return c.list();
}

async function fetchMdblistApi(src: ListSource, apiKey: string) {
  const q = (p: Record<string, string | number> = {}) => new URLSearchParams({ apikey: apiKey, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) }).toString();
  const info = await getJson(`${MDBLIST_API_ORIGIN}/lists/${encodeURIComponent(src.userSlug!)}/${encodeURIComponent(src.listSlug!)}?${q()}`, 'MDBList API');
  const rows = (Array.isArray(info) ? info : [info]).filter(isObj);
  const match = rows.find((r) => str(r.slug).toLowerCase() === src.listSlug!.toLowerCase()) ?? rows.find((r) => r.id);
  if (!match?.id) throw new ListError('MDBList did not return a list id for this link');
  const movies: unknown[] = [];
  const shows: unknown[] = [];
  let offset = 0;
  for (let i = 0; i < 20; i++) {
    const data = await getJson(`${MDBLIST_API_ORIGIN}/lists/${Number(match.id)}/items?${q({ limit: MDBLIST_API_PAGE, offset })}`, 'MDBList API');
    if (!isObj(data)) throw new ListError('MDBList API returned an unexpected items response');
    const page = [...(Array.isArray(data.movies) ? data.movies : []), ...(Array.isArray(data.shows) ? data.shows : [])].filter(isObj);
    for (const r of page) (str(r.mediatype).toLowerCase() === 'show' ? shows : movies).push(r);
    offset += page.length;
    if (!isObj(data.pagination) || !data.pagination.has_more || !page.length) return { movies, shows };
  }
  throw new ListError('MDBList list is over the 20,000 item safety limit');
}

async function fetchMdblistBrowse(apiKey: string | null | undefined, term: string | null) {
  if (!apiKey) throw new ListError('This link needs an MDBList API key. Add one under Lists → Settings (free at https://mdblist.com/preferences)');
  const q = (p: Record<string, string | number> = {}) => new URLSearchParams({ apikey: apiKey, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) }).toString();
  let payload = await getJson(term == null ? `${MDBLIST_SEARCH_ORIGIN}/lists/top/?${q()}` : `${MDBLIST_SEARCH_ORIGIN}/lists/search/?${q({ s: term })}`, 'MDBList');
  if (isObj(payload)) payload = ['lists', 'results', 'data'].map((k) => (payload as any)[k]).find(Array.isArray) ?? payload;
  if (!Array.isArray(payload)) throw new ListError('MDBList returned an unexpected list search response');
  const picked = payload.filter((r) => isObj(r) && r.id)
    .sort((a: any, b: any) => (Number(b.likes) || 0) - (Number(a.likes) || 0) || (Number(b.items) || 0) - (Number(a.items) || 0))
    .slice(0, MDBLIST_BROWSE_LISTS);
  if (!picked.length) throw new ListError('MDBList found no lists for this browse page');
  const flat: unknown[] = [];
  for (const chosen of picked) {
    let offset = 0;
    while (flat.length < MDBLIST_BROWSE_ITEMS) {
      const data = await getJson(`${MDBLIST_SEARCH_ORIGIN}/lists/${Number((chosen as any).id)}/items/?${q({ limit: Math.min(MDBLIST_API_PAGE, MDBLIST_BROWSE_ITEMS - flat.length), offset })}`, 'MDBList');
      const page = (Array.isArray(data) ? data : []).filter(isObj);
      if (!page.length) break;
      flat.push(...page);
      offset += page.length;
      if (page.length < MDBLIST_API_PAGE) break;
    }
  }
  return flat;
}

// ─── TMDB ────────────────────────────────────────────────────────────

async function fetchTmdb(path: string) {
  const api = getTmdbApi('en');
  const flat: Record<string, any>[] = [];
  let page = 1;
  let total = 1;
  while (flat.length < TMDB_MAX_ITEMS && page <= total) {
    let data: any;
    try { ({ data } = await api.get(path, { params: { page } })); }
    catch (err: any) {
      if (err?.response?.status === 404) throw new ListError('TMDB has no such list or chart; check the link');
      throw new ListError(`TMDB answered ${err?.response?.status ?? (err as Error).message}`);
    }
    const rows = Array.isArray(data?.items) ? data.items : data?.results;
    if (!Array.isArray(rows) || !rows.length) break;
    flat.push(...rows.filter(isObj));
    total = Number(data.total_pages) || 1;
    page++;
  }
  return flat.slice(0, TMDB_MAX_ITEMS);
}

async function tmdbShowIds(tmdbId: number): Promise<{ tvdb?: number; imdb?: string }> {
  try {
    const { data } = await getTmdbApi('en').get(`/tv/${tmdbId}/external_ids`);
    return { tvdb: data?.tvdb_id || undefined, imdb: str(data?.imdb_id) || undefined };
  } catch { return {}; }
}

async function normalizeTmdb(rows: Record<string, any>[], feed: string, hint: ItemType | 'mixed') {
  const c = new Collector();
  const typeOf = (row: Record<string, any>): ItemType | null => {
    const raw = str(row.media_type).toLowerCase();
    return raw === 'tv' || raw === 'show' ? 'show' : raw === 'movie' ? 'movie' : hint === 'mixed' ? null : hint;
  };
  // Shows need their TVDB/IMDb id from a separate call (bounded), eight at a time.
  const showTmdbIds = [...new Set(rows.filter((r) => typeOf(r) === 'show' && r.id).map((r) => Number(r.id)))].slice(0, TMDB_MAX_SHOW_LOOKUPS);
  const showIds = new Map<number, { tvdb?: number; imdb?: string }>();
  for (let i = 0; i < showTmdbIds.length; i += 8) {
    const batch = showTmdbIds.slice(i, i + 8);
    const res = await Promise.all(batch.map(tmdbShowIds));
    batch.forEach((id, n) => showIds.set(id, res[n]));
  }
  for (const row of rows) {
    const type = typeOf(row);
    if (!type || row.id == null) continue;
    const map = type === 'show' ? TMDB_TV_GENRES : TMDB_MOVIE_GENRES;
    const genres = (Array.isArray(row.genre_ids) ? row.genre_ids : []).map((g: number) => map[g]).filter(Boolean);
    let itemIds: ListItem['ids'];
    if (type === 'movie') itemIds = { tmdb: row.id, ...(str(row.imdb_id) ? { imdb: str(row.imdb_id) } : {}) };
    else {
      const ext = showIds.get(Number(row.id));
      if (!ext?.tvdb && !ext?.imdb) continue;
      itemIds = { tmdb: row.id, ...(ext.tvdb ? { tvdb: ext.tvdb } : {}), ...(ext.imdb ? { imdb: ext.imdb } : {}) };
    }
    c.add(type, itemIds, { title: str(row.title ?? row.name), year: yearOf(row.release_date ?? row.first_air_date), overview: str(row.overview),
      genres, lang: str(row.original_language), feed });
  }
  return c.list();
}

// ─── Cinemeta ────────────────────────────────────────────────────────

async function fetchCinemeta(src: ListSource) {
  const flat: Record<string, any>[] = [];
  let skip = 0;
  while (flat.length < CINEMETA_MAX_ITEMS) {
    const data = await getJson(skip ? `${src.apiUrl}?skip=${skip}` : src.apiUrl, 'Cinemeta');
    const page = (isObj(data) && Array.isArray(data.metas) ? data.metas : []).filter(isObj);
    if (!page.length) break;
    flat.push(...page);
    skip += page.length;
    if (page.length < CINEMETA_PAGE || !(data as any).hasMore) break;
  }
  const c = new Collector();
  for (const row of flat) {
    const type: ItemType = str(row.type).toLowerCase() === 'series' ? 'show' : 'movie';
    const imdb = str(row.imdb_id);
    if (!imdb) continue;
    c.add(type, { imdb, ...(row.moviedb_id ? { tmdb: row.moviedb_id } : {}) }, { title: str(row.name), year: yearOf(row.year ?? row.releaseInfo),
      overview: str(row.description), genres: cleanGenres(row.genres), feed: src.label });
  }
  return c.list();
}

// ─── IMDb (through Radarr's list service) ────────────────────────────

async function fetchImdb(src: ListSource) {
  // Full movie records (credits, translations...), so a 250-title chart is ~10 MB.
  const data = await getJson(src.apiUrl, 'Radarr list service', {}, { notFound: 'IMDb list not found (is it public?)', maxBytes: 32 * 1024 * 1024 });
  if (!Array.isArray(data)) throw new ListError('Radarr list service returned an unexpected response');
  const c = new Collector();
  for (const row of data) {
    if (!isObj(row)) continue;
    const tmdb = row.TmdbId ?? row.tmdbId;
    const imdb = str(row.ImdbId ?? row.imdbId);
    c.add('movie', { ...(tmdb ? { tmdb } : {}), ...(imdb ? { imdb } : {}) }, { title: str(row.Title ?? row.title), year: Number(row.Year ?? row.year) || 0,
      overview: str(row.Overview), genres: cleanGenres(row.Genres ?? row.genres), lang: str(row.OriginalLanguage ?? row.originalLanguage), feed: src.label });
  }
  return c.list();
}

// ─── List titles ─────────────────────────────────────────────────────

/** The list's own name from the site (MDBList, Trakt, TMDB lists), or null to keep the label. */
export async function fetchListTitle(src: ListSource, keys: SourceKeys): Promise<string | null> {
  const clean = (v: unknown) => { const t = str(v).replace(/\s+/g, ' ').slice(0, 120); return t || null; };
  try {
    if (src.provider === 'mdblist' && keys.mdblistApiKey) {
      const info = await getJson(`${MDBLIST_API_ORIGIN}/lists/${encodeURIComponent(src.userSlug!)}/${encodeURIComponent(src.listSlug!)}?apikey=${encodeURIComponent(keys.mdblistApiKey)}`, 'MDBList API');
      const rows = (Array.isArray(info) ? info : [info]).filter(isObj);
      const row = rows.find((r) => str(r.slug).toLowerCase() === src.listSlug!.toLowerCase()) ?? rows[0];
      return clean(row?.name);
    }
    if (src.provider === 'trakt' && keys.traktClientId) {
      const info = await getJson(`${TRAKT_API_ORIGIN}/users/${encodeURIComponent(src.userSlug!)}/lists/${encodeURIComponent(src.listSlug!)}`, 'Trakt', traktHeaders(keys.traktClientId), { anyType: true });
      return isObj(info) ? clean(info.name) : null;
    }
    if (src.provider === 'tmdb-list') {
      const { data } = await getTmdbApi('en').get(`/list/${src.term}`, { params: { page: 1 } });
      return clean(data?.name);
    }
  } catch { /* keep the fallback label */ }
  return null;
}

// ─── Entry point ─────────────────────────────────────────────────────

/** Fetch and normalise one list. Returns the items (unannotated) and a note on how it was read. */
export async function fetchListItems(src: ListSource, keys: SourceKeys): Promise<{ items: ListItem[]; resolver: string }> {
  switch (src.provider) {
    case 'trakt':
      return { items: normalizeTrakt(await fetchTraktList(src, keys.traktClientId), src.label), resolver: 'Trakt public list' };
    case 'trakt-chart':
      return { items: normalizeTrakt(await fetchTraktChart(src, keys.traktClientId), src.label), resolver: 'Trakt public chart' };
    case 'trakt-watchlist':
      return { items: normalizeTrakt(await fetchTraktWatchlist(src, keys.traktClientId), src.label), resolver: 'Trakt public watchlist' };
    case 'trakt-genre':
      return { items: normalizeTrakt(await fetchTraktGenre(src.term!, keys.traktClientId), src.label), resolver: 'Trakt trending and popular by genre' };
    case 'mdblist': {
      if (keys.mdblistApiKey) {
        try { return { items: normalizeMdblist(await fetchMdblistApi(src, keys.mdblistApiKey), src.label), resolver: 'MDBList API' }; }
        catch (err) {
          const data = await getJson(src.apiUrl, 'MDBList', {}, { notFound: 'MDBList list not found; check the link is public and correct' });
          return { items: normalizeMdblist(data, src.label), resolver: `MDBList public feed (API failed: ${(err as Error).message.slice(0, 120)})` };
        }
      }
      const data = await getJson(src.apiUrl, 'MDBList', {}, { notFound: 'MDBList list not found; check the link is public and correct' });
      return { items: normalizeMdblist(data, src.label), resolver: 'MDBList public feed' };
    }
    case 'mdblist-top':
    case 'mdblist-search':
      return { items: normalizeMdblist(await fetchMdblistBrowse(keys.mdblistApiKey, src.provider === 'mdblist-top' ? null : src.term!), src.label), resolver: 'MDBList list search' };
    case 'cinemeta':
      return { items: await fetchCinemeta(src), resolver: 'Cinemeta public catalogue' };
    case 'tmdb-list':
    case 'tmdb-chart':
    case 'tmdb-trending':
      return { items: await normalizeTmdb(await fetchTmdb(src.apiUrl), src.label, src.mediaType), resolver: 'TMDB API' };
    case 'imdb':
      return { items: await fetchImdb(src), resolver: 'IMDb through Radarr\'s list service' };
    case 'dmm':
      return { items: normalizeDmm(await getJson(src.apiUrl, 'DMM'), src.mediaType as ItemType), resolver: 'DMM public Trakt feed' };
    default:
      throw new ListError('Unsupported list source');
  }
}
