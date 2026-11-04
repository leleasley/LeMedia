import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Clock, Film, Loader2, Search, Star, Tv, User, X } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';
import type { TmdbMedia } from '@/types';
import { useMediaStatus, getStatusForMedia } from '@/hooks/useMediaStatus';
import { MediaStateBadge } from '@/utils/mediaStateDisplay';
import { getRecentSearches, removeRecentSearch } from '@/utils/recentSearches';

type SuggestItem = TmdbMedia & { media_type: string };
interface SuggestPerson { id: number; name: string; profile_path: string | null; known_for_department: string | null }

interface SearchAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;
  inputClassName?: string;
  iconClassName?: string;
}

const MAX_TITLES = 6;
/** After Enter, the dropdown grows to this many titles before Enter opens the full page. */
const MAX_TITLES_EXPANDED = 15;
const MAX_PEOPLE = 2;

function filterSuggest(data: unknown): SuggestItem[] {
  const arr = Array.isArray(data) ? data : (data as { results?: unknown })?.results;
  if (!Array.isArray(arr)) return [];
  return (arr as SuggestItem[])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
}

function peopleOf(data: unknown): SuggestPerson[] {
  const arr = (data as { people?: unknown })?.people;
  return Array.isArray(arr) ? (arr as SuggestPerson[]).filter((p) => p && typeof p.id === 'number').slice(0, MAX_PEOPLE) : [];
}

/** Navbar search with a live suggestion dropdown (people + titles with library status),
 *  recent searches on an empty focus, and arrow-key navigation. Queries ride the 1h
 *  server-side search cache, so typing costs no extra TMDB calls after the first pause. */
export default function SearchAutocomplete({ value, onChange, onSubmit, placeholder, inputClassName, iconClassName }: Readonly<SearchAutocompleteProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<SuggestItem[]>([]);
  const [people, setPeople] = useState<SuggestPerson[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const [expanded, setExpanded] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const statuses = useMediaStatus(items);

  const trimmed = value.trim();
  const showRecents = focused && trimmed.length === 0 && recents.length > 0;

  // Debounced lookup — aborts the in-flight request on each keystroke.
  useEffect(() => {
    if (trimmed.length < 2) {
      setItems([]);
      setPeople([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/tmdb/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        setItems(filterSuggest(res.data));
        setPeople(peopleOf(res.data));
        setActive(-1);
        setExpanded(false);
        setOpen(true);
      } catch {
        // Aborted keystroke or transient failure — the full page remains the fallback.
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // Route changed (submitted or picked) → close and stop showing stale hits.
  useEffect(() => {
    setOpen(false);
    setItems([]);
    setPeople([]);
    setActive(-1);
  }, [location.pathname, location.search]);

  const shownItems = items.slice(0, expanded ? MAX_TITLES_EXPANDED : MAX_TITLES);

  /** Flat option list for keyboard navigation: people first, then titles. */
  const options = useMemo(
    () => [
      ...people.map((p) => ({ key: `person-${p.id}`, to: `/person/${p.id}` })),
      ...shownItems.map((i) => ({ key: `${i.media_type}-${i.id}`, to: `/${i.media_type}/${i.id}` })),
    ],
    [people, shownItems],
  );

  const go = (to: string) => {
    setOpen(false);
    setActive(-1);
    navigate(to);
  };

  const runRecent = (q: string) => {
    onChange(q);
    setFocused(false);
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!open || options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      go(options[active].to);
    } else if (e.key === 'Enter' && !expanded && items.length > MAX_TITLES) {
      // First Enter shows more right here; a second Enter (or the footer button) opens the page.
      e.preventDefault();
      setExpanded(true);
    }
  };

  const optionClass = (index: number) => clsx(
    'flex items-center gap-3 px-3 py-2.5 transition-colors',
    index === active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05] active:bg-white/[0.08]',
  );

  return (
    <div className="relative">
      <Search className={iconClassName ?? 'absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim pointer-events-none'} />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setFocused(true);
          setRecents(getRecentSearches());
          if (items.length > 0 || people.length > 0) setOpen(true);
        }}
        onBlur={() => { setOpen(false); setFocused(false); setActive(-1); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open || showRecents}
        aria-autocomplete="list"
        className={clsx(
          'appearance-none [&::-webkit-search-cancel-button]:hidden',
          inputClassName ?? 'w-full pl-10 pr-9 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text placeholder-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 focus:border-ndp-accent/40 focus:bg-white/10 transition-all',
        )}
      />
      {searching ? (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim animate-spin" />
      ) : value ? (
        <button
          type="button"
          aria-label={t('common.clear', 'Clear')}
          onMouseDown={(e) => { e.preventDefault(); onChange(''); setItems([]); setPeople([]); setOpen(false); }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-ndp-text-dim hover:text-ndp-text"
        >
          <X className="w-4 h-4" />
        </button>
      ) : null}

      {/* Recent searches, empty input, focused */}
      {showRecents && (
        <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl bg-ndp-surface ring-1 ring-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.6)] z-50">
          <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">
            {t('search.recent', 'Recent searches')}
          </p>
          {recents.map((q) => (
            <div key={q} className="flex items-center hover:bg-white/[0.05]">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); runRecent(q); }}
                className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left"
              >
                <Clock className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                <span className="text-sm text-ndp-text truncate">{q}</span>
              </button>
              <button
                type="button"
                aria-label={t('common.remove', 'Remove')}
                onMouseDown={(e) => { e.preventDefault(); setRecents(removeRecentSearch(q)); }}
                className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (items.length > 0 || people.length > 0) && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl bg-ndp-surface ring-1 ring-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.6)] z-50"
        >
          {people.length > 0 && (
            <div className="py-1 border-b border-white/[0.06]">
              {people.map((p, i) => (
                <Link
                  key={`person-${p.id}`}
                  to={`/person/${p.id}`}
                  role="option"
                  aria-selected={active === i}
                  onMouseDown={(e) => { e.preventDefault(); go(`/person/${p.id}`); }}
                  onMouseEnter={() => setActive(i)}
                  className={optionClass(i)}
                >
                  {p.profile_path ? (
                    <img src={posterUrl(p.profile_path, 'w92')} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-white/5" />
                  ) : (
                    <span className="w-9 h-9 rounded-full flex-shrink-0 bg-white/[0.06] flex items-center justify-center">
                      <User className="w-4 h-4 text-ndp-text-dim" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ndp-text truncate">{p.name}</p>
                    <p className="text-xs text-ndp-text-dim truncate">{p.known_for_department || t('search.person', 'Person')}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="py-1">
            {shownItems.map((item, idx) => {
              const index = people.length + idx;
              const title = item.title || item.name || '';
              const year = (item.release_date || item.first_air_date || '').slice(0, 4);
              return (
                <Link
                  key={`${item.media_type}-${item.id}`}
                  to={`/${item.media_type}/${item.id}`}
                  role="option"
                  aria-selected={active === index}
                  onMouseDown={(e) => {
                    // Fires before the input's blur closes the dropdown.
                    e.preventDefault();
                    go(`/${item.media_type}/${item.id}`);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={optionClass(index)}
                >
                  {item.poster_path ? (
                    <img
                      src={posterUrl(item.poster_path, 'w92')}
                      alt=""
                      loading="lazy"
                      className="w-9 h-[54px] object-cover rounded-md flex-shrink-0 bg-white/5"
                    />
                  ) : (
                    <div className="w-9 h-[54px] rounded-md flex-shrink-0 bg-white/5 flex items-center justify-center">
                      {item.media_type === 'movie'
                        ? <Film className="w-4 h-4 text-ndp-text-dim" />
                        : <Tv className="w-4 h-4 text-ndp-text-dim" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ndp-text truncate">{title}</p>
                    <p className="flex items-center gap-1.5 text-xs text-ndp-text-dim truncate mt-0.5">
                      <span>{item.media_type === 'movie' ? t('common.movie') : t('common.series')}</span>
                      {year && <span>· {year}</span>}
                      {item.vote_average > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-ndp-gold">
                          · <Star className="w-3 h-3 fill-ndp-gold" />{item.vote_average.toFixed(1)}
                        </span>
                      )}
                    </p>
                  </div>
                  <MediaStateBadge
                    availability={getStatusForMedia(statuses, item.id, item.media_type)}
                    mediaType={item.media_type}
                    className="flex-shrink-0"
                  />
                </Link>
              );
            })}
          </div>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(false);
              onSubmit(e as unknown as React.FormEvent);
            }}
            className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left text-sm font-medium text-ndp-accent hover:bg-white/[0.05] transition-colors border-t border-white/[0.06]"
          >
            <span className="truncate">{t('search.all_results_filters', 'All results & filters')}</span>
            <Search className="w-4 h-4 flex-shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
