import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Clock, Search, User, X } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';
import { useTmdbList } from '@/hooks/useTmdbList';
import { useMediaStatus, getStatusForMedia } from '@/hooks/useMediaStatus';
import MediaGrid from '@/components/MediaGrid';
import EmptyState from '@/components/ui/EmptyState';
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch } from '@/utils/recentSearches';
import type { TmdbMedia } from '@/types';

type SearchItem = TmdbMedia & { media_type: string };
interface SearchPerson { id: number; name: string; profile_path: string | null; known_for_department: string | null }

type TypeFilter = 'all' | 'movie' | 'tv';

const cardKey = (r: SearchItem) => `${r.media_type}:${r.id}`;

interface CollectionInfo {
  id: number;
  name: string;
  poster_path?: string | null;
}

/** Franchise grouping: TMDB tags movies with `belongs_to_collection` (Marvel, Star Wars…),
 *  so a franchise search can be split into one row per collection instead of one flat grid. */
function collectionOf(item: SearchItem): CollectionInfo | null {
  const coll = (item as unknown as { belongs_to_collection?: CollectionInfo | null }).belongs_to_collection;
  return coll && typeof coll.id === 'number' && coll.name ? coll : null;
}

function filterMovieTv(data: unknown): SearchItem[] {
  const arr = Array.isArray(data) ? data : (data as { results?: unknown })?.results;
  if (!Array.isArray(arr)) return [];
  return (arr as SearchItem[]).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
}

function peopleOf(data: unknown): SearchPerson[] {
  const arr = (data as { people?: unknown })?.people;
  return Array.isArray(arr) ? (arr as SearchPerson[]).filter((p) => p && typeof p.id === 'number') : [];
}

/** Words too generic to base a fallback search on. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'les', 'des', 'une', 'le', 'la', 'de', 'du', 'un', 'el',
  'der', 'die', 'das', 'een', 'het',
]);

/** Longest meaningful word of the query, or null when there's nothing to relax
 *  (single-word queries fall straight through to trending). */
function suggestionToken(query: string): string | null {
  const words = query
    .toLowerCase()
    .split(/[\s\-_:,.'"!?()[\]]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  const token = words.reduce((a, b) => (b.length > a.length ? b : a));
  if (token === query.toLowerCase().trim()) return null;
  return token;
}

/** "In library" = already on the server (fully available or imported). */
const IN_LIBRARY = new Set(['AVAILABLE', 'IMPORTED']);

export default function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const query = searchParams.get('q') || '';
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [extra, setExtra] = useState<SearchItem[]>([]);
  const [people, setPeople] = useState<SearchPerson[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [recents, setRecents] = useState<string[]>(() => getRecentSearches());

  const { data: results, loading } = useTmdbList<TmdbMedia>(
    query ? `/tmdb/search?q=${encodeURIComponent(query)}` : null,
    query,
    {
      transform: (data) => {
        setPeople(peopleOf(data));
        return filterMovieTv(data);
      },
    },
  );

  // Nothing searched yet → show what's trending instead of an empty page.
  const { data: trending, loading: trendingLoading } = useTmdbList<TmdbMedia>(
    query ? null : '/tmdb/trending',
    'search-trending',
    { transform: (data) => filterMovieTv(data).slice(0, 18) },
  );

  // New query → drop appended pages so page-2+ fetches stay in query order, and remember it.
  useEffect(() => {
    setExtra([]);
    setPeople([]);
    setNextPage(2);
    setHasMore(true);
    setLoadingMore(false);
    setLibraryOnly(false);
    if (query) {
      addRecentSearch(query);
      setRecents(getRecentSearches());
    }
  }, [query]);

  const allItems = useMemo(
    () => [...(results as SearchItem[]), ...extra],
    [results, extra],
  );
  const statuses = useMediaStatus(allItems);
  const inLibrary = useCallback(
    (r: SearchItem) => IN_LIBRARY.has(getStatusForMedia(statuses, r.id, r.media_type)?.statusCategory ?? ''),
    [statuses],
  );

  const counts = useMemo(() => ({
    all: allItems.length,
    movie: allItems.filter((r) => r.media_type === 'movie').length,
    tv: allItems.filter((r) => r.media_type === 'tv').length,
    library: allItems.filter(inLibrary).length,
  }), [allItems, inLibrary]);

  const visible = useMemo(
    () => allItems.filter((r) =>
      (typeFilter === 'all' || r.media_type === typeFilter) && (!libraryOnly || inLibrary(r))),
    [allItems, typeFilter, libraryOnly, inLibrary],
  );

  // Split into franchise sections — but only when it actually helps: at least two
  // collections with two or more titles each. Otherwise a plain grid (and the existing
  // "show more" paging) reads better than a stack of tiny sections.
  const grouped = useMemo(() => {
    const byCollection = new Map<number, { name: string; poster: string | null; items: SearchItem[] }>();
    for (const item of visible) {
      const coll = collectionOf(item);
      if (!coll) continue;
      const group = byCollection.get(coll.id) ?? { name: coll.name, poster: coll.poster_path ?? null, items: [] };
      group.items.push(item);
      byCollection.set(coll.id, group);
    }
    const sections = [...byCollection.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .filter((g) => g.items.length >= 2);
    if (sections.length < 2) return null;

    const groupedIds = new Set(sections.flatMap((g) => g.items.map(cardKey)));
    const rest = visible.filter((i) => !groupedIds.has(cardKey(i)));
    return { sections, rest };
  }, [visible]);

  const showMore = useCallback(async () => {
    if (loadingMore || !hasMore || !query) return;
    setLoadingMore(true);
    try {
      const res = await api.get(`/tmdb/search?q=${encodeURIComponent(query)}&page=${nextPage}`);
      const known = new Set(allItems.map(cardKey));
      const fresh = filterMovieTv(res.data).filter((i) => !known.has(cardKey(i)));
      if (fresh.length === 0) {
        setHasMore(false);
      } else {
        setExtra((prev) => [...prev, ...fresh]);
        setNextPage((p) => p + 1);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, query, nextPage, allItems]);

  // Load the next page automatically when the end of the grid scrolls into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = !loading && hasMore && results.length > 0 && !libraryOnly;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void showMore();
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, showMore]);

  // "No results — but you may be looking for…": retry with the most significant
  // word, else trending. Runs only when the main search settles empty.
  const isEmpty = !loading && query !== '' && allItems.length === 0;
  const [suggestions, setSuggestions] = useState<SearchItem[]>([]);
  const [sugLoading, setSugLoading] = useState(false);

  useEffect(() => {
    if (!isEmpty) {
      setSuggestions([]);
      setSugLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setSugLoading(true);
    (async () => {
      try {
        let items: SearchItem[] = [];
        const token = suggestionToken(query);
        if (token) {
          const res = await api.get(`/tmdb/search?q=${encodeURIComponent(token)}`, {
            signal: controller.signal,
          });
          items = filterMovieTv(res.data);
        }
        if (items.length === 0) {
          const res = await api.get('/tmdb/trending', { signal: controller.signal });
          items = filterMovieTv(res.data);
        }
        if (!cancelled) setSuggestions(items.filter((i) => typeFilter === 'all' || i.media_type === typeFilter).slice(0, 12));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSugLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isEmpty, query, typeFilter]);

  const chip = (active: boolean) => clsx(
    'flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium transition-colors',
    active ? 'bg-ndp-text text-ndp-bg' : 'bg-white/[0.06] text-ndp-text-muted hover:bg-white/10 hover:text-ndp-text',
  );
  const count = (n: number, active: boolean) => (
    <span className={clsx('text-xs tabular-nums', active ? 'text-ndp-bg/60' : 'text-ndp-text-dim')}>{n}</span>
  );

  // ── No query: recent searches + trending ──────────────────────────
  if (!query) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-6 md:py-8 space-y-10">
        {recents.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h1 className="font-display-title text-[30px] text-ndp-text">{t('search.recent', 'Recent searches')}</h1>
              <button
                type="button"
                onClick={() => { clearRecentSearches(); setRecents([]); }}
                className="text-sm font-medium text-ndp-text-muted hover:text-ndp-accent transition-colors"
              >
                {t('search.clear_recent', 'Clear')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recents.map((q) => (
                <span key={q} className="inline-flex items-center h-9 rounded-full bg-white/[0.06] text-sm text-ndp-text">
                  <button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(q)}`)} className="flex items-center gap-2 pl-3.5 pr-1 h-full">
                    <Clock className="w-3.5 h-3.5 text-ndp-text-dim" />
                    <span className="max-w-[14rem] truncate">{q}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('common.remove', 'Remove')}
                    onClick={() => setRecents(removeRecentSearch(q))}
                    className="w-8 h-full flex items-center justify-center text-ndp-text-dim hover:text-ndp-text"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-display-title text-[30px] text-ndp-text mb-3">{t('search.trending_now', 'Trending now')}</h2>
          {!trendingLoading && trending.length === 0 ? (
            <EmptyState icon={Search} title={t('search.use_search_bar')} />
          ) : (
            <MediaGrid media={trending} loading={trendingLoading} skeletonCount={12} />
          )}
        </section>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────
  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-6 md:py-8">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ndp-text-dim">
          {loading ? t('search.searching') : t('search.result', { count: visible.length, query })}
        </p>
        <h1 className="font-display-title text-[38px] sm:text-5xl text-ndp-text mt-1 break-words">“{query}”</h1>
      </div>

      {!loading && allItems.length > 0 && (
        <div className="edge-fade-x flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 mb-6" style={{ scrollbarWidth: 'none' }}>
          {(['all', 'movie', 'tv'] as TypeFilter[]).map((f) => (
            <button key={f} type="button" onClick={() => setTypeFilter(f)} className={chip(typeFilter === f)}>
              {f === 'all' ? t('common.all') : f === 'movie' ? t('common.movie') : t('common.series')}
              {count(counts[f], typeFilter === f)}
            </button>
          ))}
          {counts.library > 0 && (
            <button type="button" onClick={() => setLibraryOnly((v) => !v)} aria-pressed={libraryOnly} className={chip(libraryOnly)}>
              {t('search.in_library', 'In library')}
              {count(counts.library, libraryOnly)}
            </button>
          )}
        </div>
      )}

      {/* People */}
      {!loading && people.length > 0 && typeFilter === 'all' && !libraryOnly && (
        <section className="mb-8">
          <h2 className="font-display-title text-2xl text-ndp-text mb-3">{t('search.people', 'People')}</h2>
          <div className="edge-fade-x flex gap-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1" style={{ scrollbarWidth: 'none' }}>
            {people.map((p) => (
              <Link key={p.id} to={`/person/${p.id}`} className="flex-shrink-0 w-[84px] text-center group">
                <span className="block w-[84px] h-[84px] rounded-full overflow-hidden bg-ndp-surface-light ring-1 ring-white/10 group-active:scale-95 transition-transform">
                  {p.profile_path ? (
                    <img src={posterUrl(p.profile_path, 'w185')} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center"><User className="w-7 h-7 text-ndp-text-dim" /></span>
                  )}
                </span>
                <span className="block mt-2 text-[13px] font-medium text-ndp-text leading-tight line-clamp-2">{p.name}</span>
                {p.known_for_department && <span className="block text-[11px] text-ndp-text-dim mt-0.5 truncate">{p.known_for_department}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {grouped ? (
        <>
          {grouped.sections.map((section) => (
            <section key={section.id} className="mb-10">
              <h2 className="flex items-center gap-2.5 mb-3">
                {section.poster ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${section.poster}`}
                    alt=""
                    loading="lazy"
                    className="w-7 h-10 object-cover rounded ring-1 ring-white/10"
                  />
                ) : null}
                <span className="font-display-title text-2xl text-ndp-text">{section.name}</span>
                <span className="admin-chip">{section.items.length}</span>
              </h2>
              <MediaGrid media={section.items} />
            </section>
          ))}
          {grouped.rest.length > 0 && <MediaGrid media={grouped.rest} />}
        </>
      ) : (
        <MediaGrid media={visible} loading={loading} />
      )}

      {canLoadMore && (
        <div ref={sentinelRef} className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={showMore}
            disabled={loadingMore}
            className="btn-secondary !text-sm"
          >
            {loadingMore ? t('common.loading') : t('search.show_more_results')}
          </button>
        </div>
      )}

      {!loading && visible.length === 0 && (
        <EmptyState icon={Search} title={t('search.no_results')} hint={t('search.try_other')} />
      )}

      {isEmpty && (sugLoading || suggestions.length > 0) && (
        <div className="mt-2">
          <h2 className="font-display-title text-2xl text-ndp-text mb-4">
            {t('search.suggestions')}
          </h2>
          <MediaGrid media={suggestions} loading={sugLoading} skeletonCount={7} />
        </div>
      )}
    </div>
  );
}
