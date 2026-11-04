import { useEffect, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { ChevronRight, Clock, Film, Search, SlidersHorizontal, Star, Tv, User, X } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';
import { useLiveSearch, type LiveSearchItem } from '@/hooks/useLiveSearch';
import { useMediaStatus, getStatusForMedia } from '@/hooks/useMediaStatus';
import { MediaStateBadge } from '@/utils/mediaStateDisplay';
import EmptyState from '@/components/ui/EmptyState';
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch } from '@/utils/recentSearches';

interface SearchOverlayProps {
  open: boolean;
  /** Pre-fill when opened (e.g. the current /search query). */
  initialQuery?: string;
  /** Owned by the opener so it can focus synchronously inside the tap (iOS only raises the
   *  keyboard for focus() calls made during the user gesture). */
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

/** Phone search: full-screen panel with live results. The keyboard's Search key only
 *  dismisses the keyboard; "All results & filters" opens the full results page. */
export default function SearchOverlay({ open, initialQuery = '', inputRef, onClose }: Readonly<SearchOverlayProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const [trending, setTrending] = useState<LiveSearchItem[]>([]);
  const { items, people, loading, settledQuery } = useLiveSearch(query);
  const trimmed = query.trim();
  const listItems = trimmed.length >= 2 ? items : trending;
  const statuses = useMediaStatus(listItems);

  // Reset per opening; lock the page underneath.
  useEffect(() => {
    if (!open) {
      inputRef.current?.blur();
      return;
    }
    setQuery(initialQuery);
    setRecents(getRecentSearches());
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Trending fills the empty state — fetched once, on first open.
  useEffect(() => {
    if (!open || trending.length > 0) return;
    api.get('/tmdb/trending')
      .then(({ data }) => {
        const arr = Array.isArray(data) ? data : data?.results;
        if (Array.isArray(arr)) {
          setTrending((arr as LiveSearchItem[]).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 12));
        }
      })
      .catch(() => {});
  }, [open, trending.length]);

  /** Leave the overlay for a destination — REPLACE the overlay's history entry so Back from
   *  the destination returns to the page search was opened from, not to an empty overlay. */
  const pick = (to: string) => {
    if (trimmed.length >= 2) addRecentSearch(trimmed);
    inputRef.current?.blur();
    navigate(to, { replace: true });
  };

  const showAll = () => {
    if (trimmed.length < 1) return;
    pick(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const row = (item: LiveSearchItem) => {
    const title = item.title || item.name || '';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    return (
      <button
        key={`${item.media_type}-${item.id}`}
        type="button"
        onClick={() => pick(`/${item.media_type}/${item.id}`)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/[0.06] transition-colors"
      >
        <span className="poster-frame w-12 h-[72px] flex-shrink-0">
          {item.poster_path ? (
            <img src={posterUrl(item.poster_path, 'w154')} alt="" loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-ndp-text-dim">
              {item.media_type === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
            </span>
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-ndp-text truncate">{title}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-ndp-text-dim mt-0.5">
            <span>{item.media_type === 'movie' ? t('common.movie') : t('common.series')}</span>
            {year && <span>· {year}</span>}
            {item.vote_average > 0 && (
              <span className="inline-flex items-center gap-0.5 text-ndp-gold">
                · <Star className="w-3 h-3 fill-ndp-gold" />{item.vote_average.toFixed(1)}
              </span>
            )}
          </span>
          <MediaStateBadge
            availability={getStatusForMedia(statuses, item.id, item.media_type)}
            mediaType={item.media_type}
            className="mt-1.5 !shadow-none"
          />
        </span>
        <ChevronRight className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
      </button>
    );
  };

  const typing = trimmed.length >= 2;
  const waiting = typing && (loading || settledQuery !== trimmed);

  return (
    <div
      aria-hidden={!open}
      role="dialog"
      aria-modal={open}
      aria-label={t('search.placeholder_short')}
      className={clsx(
        'md:hidden fixed inset-0 z-[80] bg-ndp-bg flex flex-col transition-[opacity,transform] duration-200 ease-out',
        open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
      )}
    >
      {/* Search header */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Keyboard "Search" just dismisses the keyboard — results are already on screen.
          if (trimmed.length >= 2) addRecentSearch(trimmed);
          inputRef.current?.blur();
        }}
        className="flex-shrink-0 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2.5 border-b border-white/[0.06]"
      >
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            tabIndex={open ? 0 : -1}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            autoCorrect="off"
            className="appearance-none [&::-webkit-search-cancel-button]:hidden w-full h-11 pl-10 pr-10 rounded-full bg-white/[0.08] text-[16px] text-ndp-text placeholder-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/40"
          />
          {query && (
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              aria-label={t('common.clear', 'Clear')}
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-ndp-text-dim"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={onClose}
          className="flex-shrink-0 px-2 h-11 text-[15px] font-medium text-ndp-accent active:opacity-60"
        >
          {t('common.cancel')}
        </button>
      </form>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {!typing && (
          <>
            {recents.length > 0 && (
              <section className="pt-4">
                <div className="flex items-baseline justify-between px-4 mb-1">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{t('search.recent', 'Recent searches')}</h2>
                  <button type="button" onClick={() => { clearRecentSearches(); setRecents([]); }} className="text-sm font-medium text-ndp-text-muted active:opacity-60">
                    {t('search.clear_recent', 'Clear')}
                  </button>
                </div>
                {recents.map((q) => (
                  <div key={q} className="flex items-center active:bg-white/[0.06]">
                    <button type="button" onClick={() => setQuery(q)} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left">
                      <Clock className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                      <span className="text-[15px] text-ndp-text truncate">{q}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t('common.remove', 'Remove')}
                      onClick={() => setRecents(removeRecentSearch(q))}
                      className="w-12 h-11 flex items-center justify-center text-ndp-text-dim flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </section>
            )}
            {trending.length > 0 && (
              <section className="pt-5">
                <h2 className="px-4 mb-1 font-display-title text-2xl text-ndp-text">{t('search.trending_now', 'Trending now')}</h2>
                {trending.map(row)}
              </section>
            )}
          </>
        )}

        {typing && waiting && items.length === 0 && (
          <div className="px-4 pt-4 space-y-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`sk-${i}`} className="flex items-center gap-3">
                <div className="skeleton w-12 h-[72px] rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-2/3 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {typing && !waiting && items.length === 0 && people.length === 0 && (
          <EmptyState icon={Search} title={t('search.no_results')} hint={t('search.try_other')} />
        )}

        {typing && people.length > 0 && (
          <section className="pt-4">
            <h2 className="px-4 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{t('search.people', 'People')}</h2>
            <div className="flex gap-4 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
              {people.map((p) => (
                <button key={p.id} type="button" onClick={() => pick(`/person/${p.id}`)} className="flex-shrink-0 w-[72px] text-center active:opacity-70">
                  <span className="block w-[72px] h-[72px] rounded-full overflow-hidden bg-ndp-surface-light ring-1 ring-white/10">
                    {p.profile_path ? (
                      <img src={posterUrl(p.profile_path, 'w185')} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center"><User className="w-6 h-6 text-ndp-text-dim" /></span>
                    )}
                  </span>
                  <span className="block mt-1.5 text-xs font-medium text-ndp-text leading-tight line-clamp-2">{p.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {typing && items.length > 0 && (
          <section className={clsx('pt-3', waiting && 'opacity-60 transition-opacity')}>
            <h2 className="px-4 mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{t('search.titles', 'Titles')}</h2>
            {items.map(row)}
            <div className="px-4 pt-3">
              <button type="button" onClick={showAll} className="btn-secondary w-full flex items-center justify-center gap-2 min-h-[46px]">
                <SlidersHorizontal className="w-4 h-4" />
                {t('search.all_results_filters', 'All results & filters')}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
