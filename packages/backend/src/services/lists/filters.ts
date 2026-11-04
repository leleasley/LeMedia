/**
 * Optional content filters for list imports. Each one is switched on per media type; the defaults
 * reproduce media-heal's guards (non-English, plus anime / kids / game shows / talk shows for TV).
 * A title whose language is unknown is never treated as foreign.
 */

export type FilterKey = 'foreign' | 'anime' | 'kids' | 'gameShows' | 'talkShows' | 'reality' | 'documentary';
export interface FilterToggle { movie: boolean; tv: boolean }
export interface ListFilters {
  rules: Record<FilterKey, FilterToggle>;
  /** ISO 639-1 codes that never count as foreign. */
  allowedLanguages: string[];
}

export const FILTER_KEYS: FilterKey[] = ['foreign', 'anime', 'kids', 'gameShows', 'talkShows', 'reality', 'documentary'];

export const DEFAULT_FILTERS: ListFilters = {
  rules: {
    foreign: { movie: true, tv: true },
    anime: { movie: false, tv: true },
    kids: { movie: false, tv: true },
    gameShows: { movie: false, tv: true },
    talkShows: { movie: false, tv: true },
    reality: { movie: false, tv: false },
    documentary: { movie: false, tv: false },
  },
  allowedLanguages: ['en'],
};

export function normalizeFilters(raw: unknown): ListFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ListFilters>;
  const rules = {} as Record<FilterKey, FilterToggle>;
  for (const k of FILTER_KEYS) {
    const v = (r.rules as Record<string, Partial<FilterToggle>> | undefined)?.[k];
    rules[k] = { movie: typeof v?.movie === 'boolean' ? v.movie : DEFAULT_FILTERS.rules[k].movie, tv: typeof v?.tv === 'boolean' ? v.tv : DEFAULT_FILTERS.rules[k].tv };
  }
  const langs = Array.isArray(r.allowedLanguages) ? r.allowedLanguages.map((l) => languageCode(String(l))).filter(Boolean) as string[] : [];
  return { rules, allowedLanguages: langs.length ? [...new Set(langs)] : ['en'] };
}

// ─── Languages ───────────────────────────────────────────────────────

const ALIASES: Record<string, string> = { iw: 'he', cn: 'zh', cmn: 'zh', yue: 'zh', mandarin: 'zh', cantonese: 'zh', ji: 'yi', in: 'id', nb: 'no', nn: 'no' };
const COMMON = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'is', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'tr', 'ru', 'uk',
  'sr', 'hr', 'sl', 'et', 'lv', 'lt', 'ga', 'cy', 'he', 'ar', 'fa', 'ur', 'hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'pa', 'th', 'vi', 'id',
  'ms', 'tl', 'zh', 'ja', 'ko', 'ka', 'hy', 'af', 'sw', 'xx'];

let nameToCode: Map<string, string> | null = null;
function names() {
  if (nameToCode) return nameToCode;
  nameToCode = new Map();
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    for (const code of COMMON) { const n = dn.of(code); if (n) nameToCode.set(n.toLowerCase(), code); }
  } catch { /* no ICU: codes still work */ }
  nameToCode.set('english', 'en'); nameToCode.set('portuguese (brazil)', 'pt'); nameToCode.set('flemish', 'nl');
  return nameToCode;
}

/** "en", "English", "English (US)", "en-GB" or a Radarr {name} object → "en". Unknown → ''. */
export function languageCode(value: unknown): string {
  let v = value && typeof value === 'object' ? (value as { name?: unknown }).name : value;
  v = String(v ?? '').trim().toLowerCase();
  if (!v || v === 'unknown' || v === 'any' || v === 'original') return '';
  const s = v as string;
  if (/^[a-z]{2,3}([-_][a-z]{2,4})?$/.test(s)) { const base = s.split(/[-_]/)[0]; return ALIASES[base] ?? base; }
  const bare = s.replace(/\s*\(.*\)\s*$/, '');
  return ALIASES[bare] ?? names().get(s) ?? names().get(bare) ?? bare;
}

export function languageName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code; } catch { return code; }
}

// ─── Classifier ──────────────────────────────────────────────────────

const LABELS: Record<Exclude<FilterKey, 'foreign'>, string> = {
  anime: 'Anime', kids: 'Kids', gameShows: 'Game show', talkShows: 'Talk show', reality: 'Reality', documentary: 'Documentary',
};
const GENRES: Record<Exclude<FilterKey, 'foreign' | 'anime'>, string[]> = {
  kids: ['children', 'kids'],
  gameShows: ['game show'],
  talkShows: ['talk show'],
  reality: ['reality', 'reality tv'],
  documentary: ['documentary'],
};

export interface Classifiable {
  mediaType: 'movie' | 'show';
  genres?: unknown;
  originalLanguage?: unknown;
  seriesType?: unknown;
}

/** Why a title is filtered out, or null when it passes. */
export function filterReason(item: Classifiable, f: ListFilters): string | null {
  const side = item.mediaType === 'show' ? 'tv' : 'movie';
  const genres = new Set((Array.isArray(item.genres) ? item.genres : []).map((g) => String(g).trim().toLowerCase().replaceAll('-', ' ')));
  const reasons: string[] = [];
  if (f.rules.anime[side] && (String(item.seriesType ?? '').toLowerCase() === 'anime' || genres.has('anime'))) reasons.push(LABELS.anime);
  for (const k of ['kids', 'gameShows', 'talkShows', 'reality', 'documentary'] as const) {
    if (f.rules[k][side] && GENRES[k].some((g) => genres.has(g))) reasons.push(LABELS[k]);
  }
  if (f.rules.foreign[side]) {
    const code = languageCode(item.originalLanguage);
    if (code && code !== 'xx' && !f.allowedLanguages.includes(code)) reasons.push(`${languageName(code)} language`);
  }
  return reasons.length ? reasons.join(', ') : null;
}
