/**
 * Pure helpers behind the Missing browse page: the shape of a row, the sort orders and the
 * paging maths. Kept free of Prisma/HTTP imports so they can be tested on their own.
 */

export type MissingType = 'movie' | 'tv';
export type MissingSort = 'recent' | 'title' | 'year' | 'runtime' | 'rating' | 'missing';

export const MISSING_SORTS: readonly MissingSort[] = ['recent', 'title', 'year', 'runtime', 'rating', 'missing'];

export interface MissingItem {
  /** TMDB id — used for the detail link and availability lookups. */
  id: number;
  tvdbId?: number;
  mediaType: MissingType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  runtime: number | null;
  rating: number | null;
  addedAt: string | null;
  overview: string | null;
  certification: string | null;
  genres: string[];
  /** Series only: episodes Sonarr reports as missing. */
  missingEpisodes?: number;
  /** Series only: episodes Sonarr reports in total. */
  totalEpisodes?: number;
}

export interface MissingPage {
  results: MissingItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** The value a sort order ranks on. `null` means "unknown" and always sorts last. */
function sortValue(item: MissingItem, sort: MissingSort): string | number | null {
  switch (sort) {
    case 'title': return item.title;
    case 'year': return item.year;
    case 'runtime': return item.runtime;
    case 'rating': return item.rating;
    case 'missing': return item.missingEpisodes ?? null;
    case 'recent':
    default: return item.addedAt;
  }
}

/** Ties keep the *arr's own order (recently added) so equal years/runtimes stay stable. */
function tiebreak(a: MissingItem, b: MissingItem): number {
  return (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.title.localeCompare(b.title);
}

export function sortMissingItems(items: MissingItem[], sort: MissingSort, order?: 'asc' | 'desc'): MissingItem[] {
  const direction = order ?? (sort === 'title' ? 'asc' : 'desc');
  const sign = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = sortValue(a, sort);
    const right = sortValue(b, sort);
    if (left === null && right === null) return tiebreak(a, b);
    if (left === null) return 1;   // unknown values last, whichever direction
    if (right === null) return -1;
    const primary = typeof left === 'string' && typeof right === 'string'
      ? left.localeCompare(right, undefined, { sensitivity: 'base' })
      : Number(left) - Number(right);
    if (primary !== 0) return primary * sign;
    return tiebreak(a, b);
  });
}

export function paginateMissingItems(items: MissingItem[], page: number, pageSize: number): { results: MissingItem[]; page: number; pageSize: number } {
  const size = Math.min(Math.max(Math.trunc(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const current = Math.max(Math.trunc(page) || 1, 1);
  const start = (current - 1) * size;
  return { results: items.slice(start, start + size), page: current, pageSize: size };
}

