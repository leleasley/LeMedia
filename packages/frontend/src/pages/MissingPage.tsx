import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDownWideNarrow, ArrowLeft, ArrowUpNarrowWide, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import MediaGrid from '@/components/MediaGrid';
import type { TmdbMedia } from '@/types';
import { missingRowToTmdbShape, type MissingApiRow } from '@/utils/mediaMapper';

/** Rows come from Radarr/Sonarr (see services/missing.ts) — already sorted and paged there. */

type SortKey = 'recent' | 'title' | 'year' | 'runtime' | 'rating' | 'missing';
type Order = 'asc' | 'desc';

const PAGE_SIZE = 40;
const ALL_SORTS: SortKey[] = ['recent', 'title', 'year', 'runtime', 'rating', 'missing'];

const SORTS: { value: SortKey; key: string; label: string }[] = [
  { value: 'recent', key: 'missing.sort.recent', label: 'Recently added' },
  { value: 'title', key: 'missing.sort.title', label: 'Title' },
  { value: 'year', key: 'missing.sort.year', label: 'Year' },
  { value: 'runtime', key: 'missing.sort.runtime', label: 'Runtime' },
  { value: 'rating', key: 'missing.sort.rating', label: 'Rating' },
];

const TV_SORT: { value: SortKey; key: string; label: string } = {
  value: 'missing', key: 'missing.sort.missing', label: 'Missing episodes',
};

function runtimeLabel(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

export default function MissingPage() {
  const { t } = useTranslation();
  const { type } = useParams<{ type: string }>();
  const isTv = type === 'series';
  // Sort lives in the URL so it survives opening a title, deleting it, and coming back.
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get('sort') as SortKey | null;
  const sort: SortKey = sortParam && ALL_SORTS.includes(sortParam) ? sortParam : 'recent';
  const orderParam = searchParams.get('order');
  const order: Order = orderParam === 'asc' || orderParam === 'desc' ? orderParam : (sort === 'title' ? 'asc' : 'desc');
  const [rows, setRows] = useState<MissingApiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    const id = ++requestId.current;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const { data } = await api.get<{ results: MissingApiRow[]; total: number; page: number }>('/media/missing', {
        params: { type: isTv ? 'tv' : 'movie', page: nextPage, pageSize: PAGE_SIZE, sort, order },
      });
      if (id !== requestId.current) return;
      setRows((prev) => (append ? [...prev, ...data.results] : data.results));
      setTotal(data.total);
      setPage(data.page ?? nextPage);
    } catch {
      if (id === requestId.current && !append) { setRows([]); setTotal(0); }
    } finally {
      if (id === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [isTv, sort, order]);

  useEffect(() => {
    setRows([]);
    setTotal(0);
    setPage(1);
    void load(1, false);
  }, [isTv, sort, order]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyParams = (nextSort: SortKey, nextOrder: Order) => {
    const params = new URLSearchParams(searchParams);
    params.set('sort', nextSort);
    params.set('order', nextOrder);
    setSearchParams(params, { replace: true });
  };
  const changeSort = (next: SortKey) => applyParams(next, next === 'title' ? 'asc' : 'desc');
  const changeOrder = () => applyParams(sort, order === 'asc' ? 'desc' : 'asc');

  const meta = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const cards = useMemo(() => rows.map(missingRowToTmdbShape), [rows]);

  const metaFor = useCallback((item: TmdbMedia) => {
    const row = meta.get(item.id);
    if (!row) return undefined;
    const runtime = runtimeLabel(row.runtime);
    if (row.mediaType === 'tv') {
      return [runtime, row.missingEpisodes ? t('missing.episodes_count', '{{count}} missing', { count: row.missingEpisodes }) : null].filter(Boolean).join(' · ') || undefined;
    }
    return [runtime, row.certification].filter(Boolean).join(' · ') || undefined;
  }, [meta, t]);

  const title = isTv ? t('missing.series_title', 'Missing series') : t('missing.movies_title', 'Missing movies');
  const remaining = Math.max(total - rows.length, 0);
  const sortOptions = isTv ? [...SORTS, TV_SORT] : SORTS;

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 pt-4 pb-16">
      <div className="flex items-start gap-3 mb-5">
        <Link to="/" className="p-2 glass rounded-xl hover:bg-white/10 transition-colors flex-shrink-0" aria-label={t('common.back', 'Back')}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-display-title text-[26px] sm:text-[30px] text-ndp-text leading-tight">{title}</h1>
          <p className="text-sm text-ndp-text-dim mt-1">
            {loading
              ? t('missing.loading', 'Loading…')
              : isTv
                ? t('missing.series_count', '{{count}} series with missing episodes', { count: total })
                : t('missing.movies_count', '{{count}} movies', { count: total })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-ndp-text-dim" htmlFor="missing-sort">
          {t('missing.sort_label', 'Sort by')}
        </label>
        <select
          id="missing-sort"
          className="input !py-2 !px-3 text-sm w-auto"
          value={sort}
          onChange={(e) => changeSort(e.target.value as SortKey)}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{t(option.key, option.label)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={changeOrder}
          className="btn-secondary !py-2 !px-3 text-sm inline-flex items-center gap-1.5"
          title={order === 'asc' ? t('missing.order_asc', 'Ascending') : t('missing.order_desc', 'Descending')}
        >
          {order === 'asc' ? <ArrowUpNarrowWide className="w-4 h-4" /> : <ArrowDownWideNarrow className="w-4 h-4" />}
          {order === 'asc' ? t('missing.order_asc_short', 'Ascending') : t('missing.order_desc_short', 'Descending')}
        </button>
      </div>

      {!loading && rows.length === 0 ? (
        <div className="rounded-2xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-ndp-text">
            {isTv
              ? t('missing.empty_series', 'Sonarr has nothing missing right now.')
              : t('missing.empty_movies', 'Radarr has nothing missing right now.')}
          </p>
          <p className="text-sm text-ndp-text-dim mt-2 max-w-lg mx-auto">
            {t('missing.empty_hint', 'This list comes straight from your media server, so a title you delete there — or one that finishes downloading — leaves this page automatically.')}
          </p>
        </div>
      ) : (
        <MediaGrid media={cards} loading={loading} skeletonCount={21} meta={metaFor} />
      )}

      {!loading && remaining > 0 && (
        <div className="flex flex-col items-center gap-2 py-8">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={loadingMore}
            onClick={() => void load(page + 1, true)}
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('missing.load_more', 'Load more')}
          </button>
          <p className="text-xs text-ndp-text-dim">
            {t('missing.remaining', '{{shown}} of {{total}} shown', { shown: rows.length, total })}
          </p>
        </div>
      )}

      <p className="text-xs text-ndp-text-dim mt-2">
        {t('missing.hint', 'Live from Radarr and Sonarr. Sort by added date, year, runtime or rating — deleting a title in your media server removes it from this list.')}
      </p>
    </div>
  );
}
