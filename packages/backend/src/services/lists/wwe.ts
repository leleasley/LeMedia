/**
 * WWE PPV / premium live events as a list (`wwe:events`). A port of media-heal's wwe_events.py.
 *
 * The catalogue is The SmackDown Hotel's public event database (the JSON its own page reads).
 * Each event is matched to a TMDB *movie* conservatively: same core title and exact year, a night
 * of a multi-night show, or a uniquely named edition. Anything weaker stays visible for review and
 * is never added. Weekly Raw/SmackDown episodes are excluded outright, and events that only exist
 * on TMDB as TV episodes are shown but never sent to Sonarr.
 *
 * Matches are cached per event (name + year) under MATCHER_VERSION, and manual pins settle the rest.
 */
import { prisma } from '../../utils/prisma.js';
import { getTmdbApi } from '../tmdb.js';
import { ListError, type ListItem } from './sources.js';

const SITE_URL = 'https://www.thesmackdownhotel.com';
const SOURCE_PAGE = `${SITE_URL}/events-results/ppv-special/wwe/`;
const DATA_PATH = '/media/com_jamegafilter/en_gb/3.json';
export const WWE_URL = 'wwe:events';
export const WWE_LABEL = 'WWE PPV and premium live events';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MATCH_WORKERS = 8;
// Same version as media-heal, so its cached matches carry over unchanged.
const MATCHER_VERSION = 8;
const BUNDLE_LIMIT = 24;
const STATE_ID = 'wwe-events';

export const EVENT_TYPES = ['Pay Per View', 'Special Event', 'TV Special Episode', 'Tournament'];
const BIG_FOUR = ['wrestlemania', 'royal rumble', 'summerslam', 'survivor series'];
const SNME = "saturday night's main event";
const NON_WWE = ['wcw', 'ecw', 'nwa', 'aew', 'tna', 'impact', 'njpw', 'roh', 'aaa', 'cmll'];

const UBLN_RE = /UBLNConfig\.dataUrl\s*=\s*"([^"]+)"/;
const BUILD_RE = /\?(\d+)/;
const BUNDLE_RE = /(?:data-src|src)="(\/media\/[^"]+\.js(?:\?[^"]*)?)"/g;
const YEAR_RE = /(?:19|20)\d{2}/;
const WEEKLY = '(monday night raw|friday night smackdown|wwe raw|wwe smackdown|raw|smackdown)';
const WEEKLY_NUM_RE = new RegExp(`\\b${WEEKLY}\\b\\s*(?:#|episode|ep\\.?|no\\.?)\\s*\\d+`, 'i');
const WEEKLY_DATE_RE = new RegExp(`\\b${WEEKLY}\\b\\s*\\(\\s*\\d{4}-\\d{2}-\\d{2}\\s*\\)`, 'i');

// ─── Types ───────────────────────────────────────────────────────────

export interface WweSettings {
  include_types: string[];
  include_nxt: boolean;
  include_big_four: boolean;
  include_snme: boolean;
  include_non_wwe: boolean;
  include_future: boolean;
  from_year: number;
  to_year: number;
}

interface WweEvent {
  source_id: string; url: string; name: string; title: string; year: number; date: string; end_date: string;
  types: string[]; series: string[]; brands: string[]; location: string[]; main_event: string; rank: number;
}

interface Part { tmdb_id: number; title: string; year: number; label: string }
interface Candidate { id: number; title: string; year: number }
interface Match {
  match: 'high' | 'medium' | 'none' | 'tv_episode';
  note?: string; confidence?: string; partial?: boolean;
  tmdb_id?: number | null; matched_title?: string; matched_year?: number;
  parts?: Part[]; candidates?: Candidate[];
  media_type?: string; series_id?: number | null; series_name?: string; season?: number | null; episode?: number | null;
  episode_name?: string; air_date?: string;
}

interface Pin {
  media_type: 'movie' | 'tv'; tmdb_id?: number; title?: string; year?: number;
  series_id?: number; series_name?: string; season?: number | null; episode?: number | null; episode_name?: string; air_date?: string;
  note?: string; pinned_at?: string; target?: string;
}

interface State {
  events?: Record<string, Record<string, any>>;
  pins?: Record<string, Pin>;
  settings?: Partial<WweSettings>;
  source_build?: string;
  matcher_version?: number;
  last_sync?: Record<string, unknown>;
  updated_at?: string;
}

// ─── State ───────────────────────────────────────────────────────────

async function readState(): Promise<State> {
  const row = await prisma.integration.findUnique({ where: { id: STATE_ID } });
  try { return row ? JSON.parse(row.config) as State : {}; } catch { return {}; }
}

async function writeState(state: State) {
  state.updated_at = new Date().toISOString();
  const config = JSON.stringify(state);
  await prisma.integration.upsert({ where: { id: STATE_ID }, update: { config }, create: { id: STATE_ID, config } });
}

/** One-off: bring media-heal's wwe-events.json across (matches, pins, settings, build stamp). */
export async function importWweState(raw: unknown) {
  if (!raw || typeof raw !== 'object' || !('events' in (raw as object))) throw new ListError('Not a media-heal WWE state file');
  const s = raw as State;
  await writeState({ events: s.events ?? {}, pins: s.pins ?? {}, settings: normalizeSettings(s.settings), source_build: s.source_build ?? '',
    matcher_version: s.matcher_version, last_sync: s.last_sync ?? {} });
  return { events: Object.keys(s.events ?? {}).length, pins: Object.keys(s.pins ?? {}).length };
}

export function defaultSettings(): WweSettings {
  return { include_types: [...EVENT_TYPES], include_nxt: true, include_big_four: true, include_snme: true, include_non_wwe: true, include_future: true, from_year: 0, to_year: 0 };
}

export function normalizeSettings(raw: unknown): WweSettings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.include_types)) base.include_types = EVENT_TYPES.filter((t) => (r.include_types as unknown[]).includes(t));
  for (const k of ['include_nxt', 'include_big_four', 'include_snme', 'include_non_wwe', 'include_future'] as const) if (k in r) base[k] = !!r[k];
  for (const k of ['from_year', 'to_year'] as const) base[k] = Math.max(0, Math.trunc(Number(r[k]) || 0));
  return base;
}

export async function saveWweSettings(raw: unknown) {
  const state = await readState();
  state.settings = normalizeSettings(raw);
  await writeState(state);
  return wweStatus();
}

// ─── HTTP ────────────────────────────────────────────────────────────

async function httpGet(url: string, accept = 'application/json'): Promise<string> {
  let res: Response;
  try {
    // The feed answers 403 without a Referer, so one is always sent.
    res = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'Mozilla/5.0 (LeMedia/1.0; +WWE events list)', Referer: SOURCE_PAGE }, redirect: 'manual', signal: AbortSignal.timeout(35_000) });
  } catch (err) { throw new ListError(`Could not reach SmackDown Hotel: ${(err as Error).message}`); }
  if (res.status !== 200) throw new ListError(`SmackDown Hotel answered HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_RESPONSE_BYTES) throw new ListError('SmackDown Hotel response is over the 8 MB safety limit');
  return new TextDecoder().decode(buf);
}

function parsePayload(text: string): Record<string, unknown> {
  let p: unknown;
  try { p = JSON.parse(text); } catch { throw new ListError('SmackDown Hotel returned invalid JSON'); }
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new ListError('SmackDown Hotel returned an unexpected response');
  return p as Record<string, unknown>;
}

const abs = (u: string) => (u.startsWith('/') ? `${SITE_URL}${u}` : u);
const buildOf = (u: string) => BUILD_RE.exec(u)?.[1] ?? '';

/** The full catalogue. The stored build stamp is tried first (one request); the page is only
 *  re-read to discover a new stamp when the site has regenerated the feed. */
async function fetchCatalogue(storedBuild: string): Promise<{ payload: Record<string, unknown>; build: string }> {
  if (storedBuild) {
    try { return { payload: parsePayload(await httpGet(`${SITE_URL}${DATA_PATH}?${storedBuild}`)), build: storedBuild }; }
    catch { /* stale stamp: rediscover */ }
  }
  const page = await httpGet(SOURCE_PAGE, 'text/html');
  let url = UBLN_RE.exec(page)?.[1] ?? '';
  if (!url) {
    const bundles = [...new Set([...page.matchAll(BUNDLE_RE)].map((m) => m[1]))].slice(0, BUNDLE_LIMIT);
    for (const b of bundles) {
      try { const found = UBLN_RE.exec(await httpGet(abs(b), 'application/javascript'))?.[1]; if (found) { url = found; break; } }
      catch { /* next bundle */ }
    }
  }
  if (!url) throw new ListError('Could not find the SmackDown Hotel data feed on its page');
  return { payload: parsePayload(await httpGet(abs(url))), build: buildOf(url) };
}

// ─── Parsing ─────────────────────────────────────────────────────────

function flat(value: unknown): string[] {
  let v = value;
  if (v && typeof v === 'object' && !Array.isArray(v)) v = (v as Record<string, unknown>).frontend_value ?? (v as Record<string, unknown>).value;
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (v == null || v === '') return [];
  return [String(v).trim()];
}
const intFirst = (v: unknown) => { for (const t of flat(v)) if (/^\d+$/.test(t)) return Number(t); return 0; };
const iso = (ts: number) => (ts > 0 ? new Date(ts * 1000).toISOString().slice(0, 10) : '');

function eventFromItem(item: unknown): WweEvent | null {
  if (!item || typeof item !== 'object') return null;
  const it = item as Record<string, any>;
  const sourceId = String(it.id ?? '').trim();
  const name = String(it.name ?? '').trim();
  if (!sourceId || !name) return null;
  const attr = it.attr && typeof it.attr === 'object' ? it.attr : {};
  let year = intFirst(attr.ct23);
  if (!year) { const m = YEAR_RE.exec(name); year = m ? Number(m[0]) : 0; }
  return {
    source_id: sourceId, url: abs(String(it.url ?? '')), name, title: name.replace(/\s*\((\d{4})\)\s*$/, '').trim() || name, year,
    date: iso(intFirst(attr.ct22)), end_date: iso(intFirst(attr.ct21)), types: flat(attr.ct17), series: flat(attr.ct24), brands: flat(attr.ct25),
    location: flat(attr.ct19), main_event: flat(attr.ct26)[0] ?? '', rank: 0,
  };
}

function parseEvents(payload: Record<string, unknown>): WweEvent[] {
  const events = Object.values(payload).map(eventFromItem).filter((e): e is WweEvent => !!e);
  events.sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99') || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  events.forEach((e, i) => { e.rank = i; });
  return events;
}

const weeklyEpisode = (name: string) => WEEKLY_NUM_RE.test(name) || WEEKLY_DATE_RE.test(name);
const hay = (e: WweEvent) => [...e.series, e.name].join(' ').toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function includedEvent(e: WweEvent, s: WweSettings): boolean {
  if (weeklyEpisode(e.name)) return false;
  if (s.include_types.length && !e.types.some((t) => s.include_types.includes(t))) return false;
  if (s.from_year && (!e.year || e.year < s.from_year)) return false;
  if (s.to_year && (!e.year || e.year > s.to_year)) return false;
  if (!s.include_future && e.date && e.date > new Date().toISOString().slice(0, 10)) return false;
  const h = hay(e);
  if (!s.include_nxt && (h.includes('nxt') || e.brands.some((b) => b.toLowerCase().includes('nxt')))) return false;
  if (!s.include_big_four && BIG_FOUR.some((t) => h.includes(t))) return false;
  if (!s.include_snme && h.includes(SNME)) return false;
  if (!s.include_non_wwe && NON_WWE.some((n) => new RegExp(`\\b${escapeRe(n)}\\b`).test(h))) return false;
  return true;
}

// ─── Title matching ──────────────────────────────────────────────────

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
const ROMAN_STEPS: [number, string][] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function fromRoman(text: string) {
  let total = 0; let prev = 0;
  for (const ch of [...text.toLowerCase()].reverse()) {
    const v = ROMAN_VALUES[ch] ?? 0;
    if (v < prev) total -= v; else { total += v; prev = v; }
  }
  return total;
}
function toRoman(n: number) { let out = ''; for (const [v, s] of ROMAN_STEPS) while (n >= v) { out += s; n -= v; } return out; }

const normTitle = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function coreTitle(value: unknown): string {
  let text = String(value ?? '');
  // TMDB mixes roman and arabic edition numbers, so fold standalone uppercase roman tokens.
  text = text.replace(/\b[IVXLCDM]{1,6}\b/g, (m) => { const n = fromRoman(m); return n >= 1 && n <= 50 ? String(n) : m; });
  text = normTitle(text);
  text = text.replace(/\b(?:19|20)\d{2}\b/g, ' ');
  text = text.replace(/\b(wwe|wwf|wwe network|presents)\b/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function editionSwaps(text: string): string[] {
  const out: string[] = [];
  const arabic = /\s(\d{1,2})$/.exec(text);
  if (arabic) { const n = Number(arabic[1]); if (n >= 1 && n <= 50) out.push(`${text.slice(0, arabic.index)} ${toRoman(n)}`); }
  const roman = /\s([ivxlcdm]+)$/i.exec(text);
  if (roman) { const n = fromRoman(roman[1]); if (n >= 1 && n <= 50) out.push(`${text.slice(0, roman.index)} ${n}`); }
  return out;
}

const titleTokens = (t: string) => t.split(/[^A-Za-z0-9]+/).filter(Boolean);
function shortened(text: string, maxDrop = 2) {
  const tokens = titleTokens(text);
  const out: string[] = [];
  for (let drop = 1; drop <= maxDrop; drop++) if (tokens.length - drop >= 2) out.push(tokens.slice(0, tokens.length - drop).join(' '));
  return out;
}

function queryVariants(e: WweEvent): string[] {
  let base = e.name.replace(/\s*\((\d{4})\)\s*$/, '').trim();
  base = base.replace(/\s+(?:19|20)\d{2}\s*$/, '').trim();
  const bare = base.replace(/^(?:wwf|wwe|wwe network)\s+/i, '').trim();
  const stems = [base];
  if (bare && bare !== base) stems.push(bare);
  for (const [prefix, repl] of [['WWF', 'WWE'], ['WWE', 'WWF']]) if (base.toUpperCase().startsWith(prefix)) stems.push(repl + base.slice(prefix.length));
  if (e.series[0] && !stems.includes(e.series[0])) stems.push(e.series[0]);
  for (const stem of [...stems]) for (const s of shortened(stem, 2)) if (!stems.includes(s)) stems.push(s);
  const variants: string[] = [];
  const add = (v: string) => { const t = v.trim(); if (t && !variants.includes(t) && variants.length < 16) variants.push(t); };
  for (const stem of stems) {
    add(stem);
    if (e.year && !stem.includes(String(e.year))) add(`${stem} ${e.year}`);
    for (const sw of editionSwaps(stem)) { add(sw); if (e.year && !sw.includes(String(e.year))) add(`${sw} ${e.year}`); }
  }
  return variants;
}

const NIGHT_LABELS = new Set(['saturday', 'sunday', 'friday', 'monday', 'thursday', 'tuesday', 'wednesday', 'night one', 'night two', 'night three',
  'night 1', 'night 2', 'night 3', 'night i', 'night ii', 'night iii', 'day one', 'day two', 'day three', 'day 1', 'day 2', 'part one', 'part two',
  'part 1', 'part 2', 'saturday night', 'sunday night']);
const EXTRA_MATERIAL = ['kickoff', 'kick off', 'kick-off', 'countdown', 'post show', 'post-show', 'postshow', 'pre show', 'pre-show', 'preshow',
  'watch along', 'press conference', 'press event', 'presser', 'fallout'];
const QUALIFIERS = ['spectacular', 'special', 'supershow', 'dark match', 'dark ', 'reunion', 'the musical', 'hall of fame'];
const MONTHS = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
const skipExtra = (t: string) => EXTRA_MATERIAL.some((p) => t.includes(p)) || QUALIFIERS.some((w) => t.includes(w)) || t.split(' ').some((x) => MONTHS.has(x));

function classify(cc: string, core: string): [string, string] {
  if (!cc || !core) return ['', ''];
  if (cc === core) return ['exact', ''];
  if (cc.startsWith(`${core} `)) {
    const extra = cc.slice(core.length + 1).trim();
    if (NIGHT_LABELS.has(extra)) return ['part', extra];
    return skipExtra(extra) ? ['', ''] : ['named', extra];
  }
  if (core.startsWith(`${cc} `)) {
    const extra = core.slice(cc.length + 1).trim();
    return skipExtra(extra) ? ['', ''] : ['named', extra];
  }
  return ['', ''];
}

interface Scored { tmdb_id: number; row: Record<string, any>; year: number; kind: string; extra: string }
const tmdbYear = (row: Record<string, any>) => { const m = YEAR_RE.exec(String(row.release_date ?? '')); return m ? Number(m[0]) : 0; };
const part = (r: Scored, label: string): Part => ({ tmdb_id: r.tmdb_id, title: String(r.row.title ?? ''), year: r.year, label: label.slice(0, 40) });
const high = (parts: Part[], note: string, candidates: Candidate[]): Match => ({ match: 'high', note, confidence: 'high', partial: parts.length > 1,
  tmdb_id: parts[0].tmdb_id, matched_title: parts[0].title, matched_year: parts[0].year, parts, candidates });
const review = (note: string, candidates: Candidate[], r: Scored | null): Match => ({ match: 'medium', note, confidence: 'medium', candidates,
  ...(r ? { tmdb_id: r.tmdb_id, matched_title: String(r.row.title ?? ''), matched_year: r.year } : {}) });

/** Conservative scoring: never the first result blindly. See the file comment. */
function scoreEvent(e: WweEvent, rows: Record<string, any>[]): Match {
  const core = coreTitle(e.name);
  const year = e.year;
  if (!core) return { match: 'none', note: 'no_title', candidates: [] };
  const found = new Map<number, Scored>();
  for (const row of rows) {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    let kind = ''; let extra = '';
    for (const t of [row.title, row.original_title]) { [kind, extra] = classify(coreTitle(t), core); if (kind) break; }
    if (!kind) continue;
    found.set(id, { tmdb_id: id, row, year: tmdbYear(row), kind, extra });
  }
  if (!found.size) return { match: 'none', note: 'no_core_match', candidates: [] };
  const scored = [...found.values()];
  const candidates = scored.slice(0, 8).map((r) => ({ id: r.tmdb_id, title: String(r.row.title ?? ''), year: r.year }));
  const exact = scored.filter((r) => r.kind === 'exact' && year && r.year === year);
  const nights = scored.filter((r) => r.kind === 'part' && year && r.year === year);
  const named = scored.filter((r) => r.kind === 'named' && year && r.year === year);
  if (exact.length) {
    // Same core title and year: duplicate TMDB records of one event; take the most popular.
    exact.sort((a, b) => (Number(b.row.popularity) || 0) - (Number(a.row.popularity) || 0) || a.tmdb_id - b.tmdb_id);
    return high([part(exact[0], '')], exact.length === 1 ? 'exact_title_year' : 'duplicate_entry', candidates);
  }
  if (nights.length) {
    nights.sort((a, b) => a.year - b.year || String(a.row.title ?? '').localeCompare(String(b.row.title ?? '')));
    return high(nights.map((r) => part(r, r.extra)), 'multi_night', candidates);
  }
  if (named.length === 1) return high([part(named[0], named[0].extra)], 'named_edition', candidates);
  if (named.length > 1) return review('ambiguous', candidates, named[0]);
  const near = scored.filter((r) => year && r.year && Math.abs(r.year - year) === 1);
  if (near.length) return review('year_mismatch', candidates, near[0]);
  return review(year ? 'year_mismatch' : 'year_unknown', candidates, scored[0]);
}

// ─── TMDB ────────────────────────────────────────────────────────────

const searchCache = new Map<string, Record<string, any>[]>();
async function tmdbSearch(kind: 'movie' | 'tv', query: string): Promise<Record<string, any>[]> {
  const k = `${kind}:${query}`;
  if (searchCache.has(k)) return searchCache.get(k)!;
  const { data } = await getTmdbApi('en').get(`/search/${kind}`, { params: { query, include_adult: false } });
  const rows = (Array.isArray(data?.results) ? data.results : []).filter((r: unknown) => r && typeof r === 'object');
  if (searchCache.size > 5000) searchCache.clear();
  searchCache.set(k, rows);
  return rows;
}

async function resolveMovie(e: WweEvent): Promise<Match> {
  const rows: Record<string, any>[] = [];
  const seen = new Set<string>();
  for (const v of queryVariants(e)) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try { rows.push(...await tmdbSearch('movie', v)); } catch { continue; }
    // A definitive single-movie match can't be improved on by later variants.
    const probe = scoreEvent(e, rows);
    if (probe.match === 'high' && (probe.note === 'exact_title_year' || probe.note === 'duplicate_entry')) return probe;
  }
  return scoreEvent(e, rows);
}

// SNME, NXT specials and Worlds Collide are TMDB *episodes*; matched by air date, shown, never added.
const TV_SERIES_HINTS: [string, string][] = [
  ["saturday night's main event", "WWE Saturday Night's Main Event"], ['saturday nights main event', "WWE Saturday Night's Main Event"],
  ['worlds collide', 'WWE Worlds Collide'], ['nxt', 'WWE NXT'],
];
const TV_SERIES_NAMES: Record<number, string> = {
  477: "WWE Saturday Night's Main Event", 31991: 'WWE NXT', 67097: 'WWE Cruiserweight Classic', 72765: 'WWE Mae Young Classic',
  76389: 'WWE Mixed-Match Challenge', 122611: 'WWE Worlds Collide',
};
const tvSeriesName = (id: unknown, name?: string) => (name?.trim() || TV_SERIES_NAMES[Number(id)] || '');
const seasonCache = new Map<string, Record<string, any>[]>();

async function tvEpisodeOn(seriesId: number, airDate: string) {
  const { data: detail } = await getTmdbApi('en').get(`/tv/${seriesId}`);
  const seasons = (detail?.seasons ?? []).filter((s: any) => s.season_number != null && s.air_date).sort((a: any, b: any) => String(a.air_date).localeCompare(String(b.air_date)));
  const covering = seasons.filter((s: any) => s.air_date <= airDate);
  const scan = [...(covering.length ? [covering[covering.length - 1]] : []), ...seasons.filter((s: any) => s.season_number === 0)];
  for (const s of scan) {
    const key = `${seriesId}:${s.season_number}`;
    let eps = seasonCache.get(key);
    if (!eps) {
      const { data } = await getTmdbApi('en').get(`/tv/${seriesId}/season/${s.season_number}`);
      eps = (data?.episodes ?? []).filter((x: unknown) => x && typeof x === 'object');
      seasonCache.set(key, eps!);
    }
    const ep = eps!.find((x) => x.air_date === airDate);
    if (ep) return { series_id: seriesId, series_name: String(detail?.name ?? ''), season: s.season_number, episode: ep.episode_number, episode_name: String(ep.name ?? ''), air_date: ep.air_date };
  }
  return null;
}

async function resolveTv(e: WweEvent): Promise<Match> {
  if (!e.date) return { match: 'none', note: 'no_date', candidates: [] };
  const h = hay(e);
  const queries: string[] = [];
  for (const [token, series] of TV_SERIES_HINTS) if (h.includes(token)) queries.push(series);
  queries.push(...e.series, e.name.replace(/\s*\(?\d{4}\)?\s*$/, '').trim());
  for (const q of [...new Set(queries.filter((x) => x && x.length >= 3))]) {
    let results: Record<string, any>[];
    try { results = await tmdbSearch('tv', q); } catch { continue; }
    for (const row of results.slice(0, 3)) {
      if (!row.id) continue;
      const found = await tvEpisodeOn(Number(row.id), e.date).catch(() => null);
      if (found) return { match: 'tv_episode', media_type: 'tv', confidence: 'tv', note: 'tv_episode', ...found, candidates: [] };
    }
  }
  return { match: 'none', note: 'no_tv_match', candidates: [] };
}

function matchFromPin(pin: Pin): Match {
  if (pin.media_type === 'tv') return { match: 'tv_episode', media_type: 'tv', confidence: 'tv', note: 'pinned', series_id: pin.series_id, series_name: pin.series_name ?? '',
    season: pin.season ?? null, episode: pin.episode ?? null, episode_name: pin.episode_name ?? '', air_date: pin.air_date ?? '', candidates: [] };
  return { match: 'high', note: 'pinned', confidence: 'high', tmdb_id: pin.tmdb_id, matched_title: pin.title ?? '', matched_year: pin.year ?? 0,
    parts: [{ tmdb_id: Number(pin.tmdb_id), title: pin.title ?? '', year: pin.year ?? 0, label: '' }], candidates: [] };
}

async function resolveMany(events: WweEvent[], state: State): Promise<Map<string, Match>> {
  const cache = state.matcher_version === MATCHER_VERSION ? state.events ?? {} : {};
  const pins = state.pins ?? {};
  const out = new Map<string, Match>();
  const one = async (e: WweEvent) => {
    const pin = pins[e.source_id];
    if (pin?.media_type) return out.set(e.source_id, matchFromPin(pin));
    const c = cache[e.source_id];
    if (c && c.name === e.name && c.year === e.year && c.match) {
      return out.set(e.source_id, { match: c.match, confidence: c.confidence, note: c.note ?? '', tmdb_id: c.tmdb_id, matched_title: c.matched_title ?? '',
        matched_year: c.matched_year ?? 0, media_type: c.media_type ?? 'movie', series_id: c.series_id, season: c.season, episode: c.episode,
        episode_name: c.episode_name ?? '', series_name: tvSeriesName(c.series_id, c.series_name), air_date: c.air_date ?? '', parts: c.parts ?? [], candidates: c.candidates ?? [] });
    }
    const movie = await resolveMovie(e);
    if (movie.match === 'high') return out.set(e.source_id, movie);
    const tv = await resolveTv(e).catch(() => ({ match: 'none' as const }));
    out.set(e.source_id, tv.match === 'tv_episode' ? tv : movie);
  };
  const queue = [...events];
  await Promise.all(Array.from({ length: MATCH_WORKERS }, async () => { for (let e = queue.shift(); e; e = queue.shift()) await one(e); }));
  return out;
}

async function persist(events: WweEvent[], matches: Map<string, Match>, settings: WweSettings, build: string, sourceItems: number) {
  const state = await readState();
  const store = state.events ?? {};
  const now = new Date().toISOString();
  for (const e of events) {
    const m = matches.get(e.source_id) ?? { match: 'none' };
    store[e.source_id] = {
      source_id: e.source_id, name: e.name, title: e.title, year: e.year, date: e.date, types: e.types, series: e.series, brands: e.brands, url: e.url,
      match: m.match ?? 'none', confidence: m.confidence ?? m.match ?? 'none', note: m.note ?? '', tmdb_id: m.tmdb_id ?? null,
      matched_title: m.matched_title ?? '', matched_year: m.matched_year ?? 0, media_type: m.media_type ?? 'movie', series_id: m.series_id ?? null,
      season: m.season ?? null, episode: m.episode ?? null, series_name: tvSeriesName(m.series_id, m.series_name), episode_name: m.episode_name ?? '',
      air_date: m.air_date ?? '', parts: m.parts ?? [], candidates: m.candidates ?? [], first_seen: store[e.source_id]?.first_seen ?? now, last_seen: now,
    };
  }
  const ms = events.map((e) => matches.get(e.source_id));
  const highN = ms.filter((m) => m?.match === 'high').length;
  const none = ms.filter((m) => m?.match === 'none').length;
  const tv = ms.filter((m) => m?.match === 'tv_episode').length;
  Object.assign(state, {
    events: store, matcher_version: MATCHER_VERSION, settings, ...(build ? { source_build: build } : {}),
    last_sync: { at: now, build, source_items: sourceItems, included: events.length, resolved: highN, tv, unmatched: none,
      review: events.length - highN - none - tv, movies: ms.reduce((n, m) => n + (m?.match === 'high' ? m.parts?.length ?? 0 : 0), 0) },
  });
  await writeState(state);
}

function reviewReason(m: Match) {
  if (m.match === 'none') return 'Unmatched: no TMDB movie found';
  if (m.note === 'ambiguous') return 'Review: more than one TMDB match';
  if (m.note === 'year_mismatch') return 'Review: TMDB year differs from the event year';
  if (m.note === 'year_unknown') return 'Review: event year could not be checked against TMDB';
  return 'Review: needs a confident TMDB match';
}

export interface WweListItem extends ListItem { presetBlock?: string; wwe?: { source_id: string; url: string; date: string; note: string; part: string } }

/** The WWE events as list items. Multi-night events become one movie per night; duplicate TMDB
 *  ids collapse; review / unmatched / TV-episode rows stay visible but pre-blocked. */
export async function fetchWweItems(): Promise<{ items: WweListItem[]; resolver: string }> {
  const state = await readState();
  const settings = normalizeSettings(state.settings);
  const { payload, build } = await fetchCatalogue(String(state.source_build ?? ''));
  const events = parseEvents(payload).filter((e) => includedEvent(e, settings));
  const matches = await resolveMany(events, state);
  await persist(events, matches, settings, build, Object.keys(payload).length);

  const items: WweListItem[] = [];
  const seenTmdb = new Map<number, WweListItem>();
  const seenKeys = new Set<string>();
  const base = (e: WweEvent, key: string, title: string, ids: ListItem['ids'], m: Match, label: string): WweListItem => ({
    key, mediaType: 'movie', title: title.slice(0, 300), year: e.year, ids, overview: e.main_event.slice(0, 320), genres: [], originalLanguage: '',
    feeds: [WWE_LABEL], appearances: 1, rank: e.rank, wwe: { source_id: e.source_id, url: e.url, date: e.date, note: m.note ?? '', part: label },
  });
  for (const e of events) {
    const m = matches.get(e.source_id) ?? { match: 'none' as const, note: 'unresolved' };
    if (m.match === 'tv_episode') {
      const key = `tv:${m.series_id}:s${m.season}e${m.episode}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const label = `${tvSeriesName(m.series_id, m.series_name) || `Series ${m.series_id}`} S${m.season}E${m.episode}`;
      items.push({ ...base(e, key, label, {}, m, ''), presetBlock: `TV episode (${label}), not a Radarr movie` });
      continue;
    }
    if (m.match === 'high' && m.parts?.length) {
      for (const p of m.parts) {
        const prior = seenTmdb.get(p.tmdb_id);
        if (prior) { prior.appearances++; continue; }
        const it = base(e, `movie:tmdb:${p.tmdb_id}`, p.title || e.title, { tmdb: p.tmdb_id }, m, p.label);
        items.push(it);
        seenTmdb.set(p.tmdb_id, it);
      }
    } else {
      items.push({ ...base(e, `movie:wwe:${e.source_id}`, e.title, {}, m, ''), presetBlock: reviewReason(m) });
    }
  }
  return { items, resolver: 'SmackDown Hotel catalogue, matched to TMDB movies (title and year)' };
}

// ─── Status, pins ────────────────────────────────────────────────────

export async function wweStatus() {
  const state = await readState();
  const rows = Object.values(state.events ?? {});
  const pins = state.pins ?? {};
  return {
    settings: normalizeSettings(state.settings),
    availableTypes: EVENT_TYPES,
    lastSync: state.last_sync ?? {},
    counts: {
      total: rows.length,
      resolved: rows.filter((r) => r.match === 'high').length,
      tv: rows.filter((r) => r.match === 'tv_episode').length,
      review: rows.filter((r) => r.match === 'medium').length,
      unmatched: rows.filter((r) => r.match === 'none').length,
      pinned: Object.keys(pins).length,
    },
    needsReview: rows.filter((r) => (r.match === 'medium' || r.match === 'none') && !pins[String(r.source_id)])
      .map((r) => ({ sourceId: String(r.source_id), title: String(r.title ?? r.name ?? ''), year: r.year ?? 0, date: r.date ?? '', match: r.match, note: r.note ?? '', url: r.url ?? '',
        candidates: (r.candidates ?? []).slice(0, 4) }))
      .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase())).slice(0, 200),
    pins: Object.entries(pins).map(([sourceId, p]) => ({ sourceId, title: p.title ?? p.series_name ?? '', year: p.year ?? 0, mediaType: p.media_type, tmdbId: p.tmdb_id ?? p.series_id, event: state.events?.[sourceId]?.title ?? '' })),
    sourceUrl: SOURCE_PAGE,
  };
}

/** Settle a review row by hand: a TMDB movie (or TV series) link or id. */
export async function pinEvent(sourceId: string, target: string) {
  const id = String(sourceId ?? '').trim();
  if (!id) throw new ListError('Pick an event');
  const t = String(target ?? '').trim();
  let kind: 'movie' | 'tv' = 'movie';
  let tmdbId = 0;
  const url = /themoviedb\.org\/(movie|tv)\/(\d+)/i.exec(t);
  const pref = /^(movie|tv):(\d+)$/i.exec(t);
  if (url) { kind = url[1].toLowerCase() as 'movie' | 'tv'; tmdbId = Number(url[2]); }
  else if (pref) { kind = pref[1].toLowerCase() as 'movie' | 'tv'; tmdbId = Number(pref[2]); }
  else if (/^\d+$/.test(t)) tmdbId = Number(t);
  if (!tmdbId) throw new ListError('Enter a TMDB movie link, e.g. https://www.themoviedb.org/movie/1268363');
  const api = getTmdbApi('en');
  let pin: Pin;
  try {
    if (kind === 'movie') {
      const { data } = await api.get(`/movie/${tmdbId}`);
      pin = { media_type: 'movie', tmdb_id: tmdbId, title: String(data.title ?? ''), year: Number(String(data.release_date ?? '').slice(0, 4)) || 0, note: 'pinned' };
    } else {
      const { data } = await api.get(`/tv/${tmdbId}`);
      pin = { media_type: 'tv', series_id: tmdbId, series_name: String(data.name ?? ''), season: null, episode: null, episode_name: '', air_date: '', note: 'pinned' };
    }
  } catch { throw new ListError('TMDB has no such title'); }
  pin.pinned_at = new Date().toISOString();
  pin.target = t;
  const state = await readState();
  state.pins = { ...(state.pins ?? {}), [id]: pin };
  await writeState(state);
  return pin;
}

export async function unpinEvent(sourceId: string) {
  const id = String(sourceId ?? '').trim();
  const state = await readState();
  if (state.pins) delete state.pins[id];
  const entry = state.events?.[id];
  if (entry) Object.assign(entry, { match: 'none', note: 'unpinned', matched_title: '', tmdb_id: null, parts: [], media_type: 'movie', series_id: null, season: null, episode: null });
  await writeState(state);
}
