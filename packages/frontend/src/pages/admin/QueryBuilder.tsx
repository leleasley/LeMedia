import { useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';

export interface DiscoverQuery {
  mediaType: 'movie' | 'tv';
  genres?: number[];
  yearGte?: number;
  yearLte?: number;
  releasedWithin?: string; // 'last_30d' | 'last_90d' | 'last_6m' | 'last_1y' | ''
  voteAverageGte?: number;
  voteCountGte?: number;
  sortBy?: string;
  language?: string;
  watchProviders?: number[];
  watchRegion?: string;
}

interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface QueryBuilderProps {
  query: DiscoverQuery;
  onChange: (query: DiscoverQuery) => void;
  previewResults: any[];
  previewLoading: boolean;
}

interface Genre {
  id: number;
  name: string;
}

const MOVIE_SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Popularity ↓' },
  { value: 'popularity.asc', label: 'Popularity ↑' },
  { value: 'vote_average.desc', label: 'Rating ↓' },
  { value: 'vote_average.asc', label: 'Rating ↑' },
  { value: 'primary_release_date.desc', label: 'Release date ↓' },
  { value: 'primary_release_date.asc', label: 'Release date ↑' },
  { value: 'revenue.desc', label: 'Revenue ↓' },
  { value: 'revenue.asc', label: 'Revenue ↑' },
];

const TV_SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Popularity ↓' },
  { value: 'popularity.asc', label: 'Popularity ↑' },
  { value: 'vote_average.desc', label: 'Rating ↓' },
  { value: 'vote_average.asc', label: 'Rating ↑' },
  { value: 'first_air_date.desc', label: 'Air date ↓' },
  { value: 'first_air_date.asc', label: 'Air date ↑' },
];

const RELEASE_WINDOW_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'last_6m', label: 'Last 6 months' },
  { value: 'last_1y', label: 'Last year' },
];

const LANGUAGE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'pt', label: 'Portuguese' },
];

export function QueryBuilder({ query, onChange, previewResults, previewLoading }: Readonly<QueryBuilderProps>) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genresLoading, setGenresLoading] = useState(false);
  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);

  // Fetch genres when media type changes
  useEffect(() => {
    let cancelled = false;
    async function fetchGenres() {
      setGenresLoading(true);
      try {
        const { data } = await api.get(`/tmdb/genres/${query.mediaType}`);
        if (!cancelled) setGenres(data.genres || []);
      } catch (err) {
        console.error('Failed to fetch genres', err);
        if (!cancelled) setGenres([]);
      } finally {
        if (!cancelled) setGenresLoading(false);
      }
    }
    fetchGenres();
    return () => { cancelled = true; };
  }, [query.mediaType]);

  // Fetch watch providers when media type changes (cached a week server-side)
  useEffect(() => {
    let cancelled = false;
    async function fetchProviders() {
      setProvidersLoading(true);
      try {
        const { data } = await api.get(`/tmdb/watch/providers/${query.mediaType}`);
        if (!cancelled) setProviders(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch watch providers', err);
        if (!cancelled) setProviders([]);
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    }
    fetchProviders();
    return () => { cancelled = true; };
  }, [query.mediaType]);

  const toggleGenre = (id: number) => {
    const current = query.genres || [];
    const next = current.includes(id)
      ? current.filter(g => g !== id)
      : [...current, id];
    onChange({ ...query, genres: next });
  };

  const setMediaType = (mt: 'movie' | 'tv') => {
    // Reset genres when switching media type since IDs differ
    // Also reset sortBy if current value isn't valid for the new media type
    const validSorts = mt === 'tv' ? TV_SORT_OPTIONS : MOVIE_SORT_OPTIONS;
    const sortStillValid = validSorts.some(o => o.value === query.sortBy);
    onChange({ ...query, mediaType: mt, genres: [], watchProviders: [], sortBy: sortStillValid ? query.sortBy : 'popularity.desc' });
  };

  const toggleProvider = (id: number) => {
    const current = query.watchProviders || [];
    const next = current.includes(id)
      ? current.filter(p => p !== id)
      : [...current, id];
    onChange({ ...query, watchProviders: next });
  };

  const segBtn = (active: boolean) => clsx(
    'px-5 min-h-[36px] rounded-md text-sm font-medium transition-colors',
    active ? 'bg-ndp-accent text-white' : 'text-ndp-text-dim hover:text-ndp-text',
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Media type toggle, group of buttons, labelled by a sibling span */}
      <div role="group" aria-labelledby={`${fieldId}-media-type`}>
        <span id={`${fieldId}-media-type`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
          {t('admin.homepage.media_type', 'Media type')}
        </span>
        <div className="inline-flex gap-1 p-1 rounded-lg bg-ndp-surface-light border border-white/[0.06]">
          <button
            type="button"
            onClick={() => setMediaType('movie')}
            className={segBtn(query.mediaType === 'movie')}
          >
            {t('common.movie', 'Movie')}
          </button>
          <button
            type="button"
            onClick={() => setMediaType('tv')}
            className={segBtn(query.mediaType === 'tv')}
          >
            {t('common.tv', 'TV')}
          </button>
        </div>
      </div>

      {/* Genres, group of toggle chips */}
      <div role="group" aria-labelledby={`${fieldId}-genres`}>
        <span id={`${fieldId}-genres`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
          {t('admin.homepage.genres', 'Genres')}
        </span>
        {genresLoading ? (
          <div className="flex items-center gap-1.5 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-ndp-text-dim" />
            <span className="text-xs text-ndp-text-dim">{t('common.loading', 'Loading...')}</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {genres.map(genre => {
              const active = query.genres?.includes(genre.id) ?? false;
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggleGenre(genre.id)}
                  className={clsx(
                    'px-3 min-h-[34px] rounded-full border text-xs font-medium transition-colors',
                    active
                      ? 'border-ndp-accent/60 bg-ndp-accent/15 text-ndp-accent'
                      : 'border-white/[0.1] text-ndp-text-muted hover:text-ndp-text hover:border-white/20',
                  )}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Streaming services, logo toggle chips (TMDB watch providers) */}
      <div role="group" aria-labelledby={`${fieldId}-providers`}>
        <span id={`${fieldId}-providers`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
          {t('admin.homepage.watch_providers', 'Streaming on')}
        </span>
        {providersLoading ? (
          <div className="flex items-center gap-1.5 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-ndp-text-dim" />
            <span className="text-xs text-ndp-text-dim">{t('common.loading', 'Loading...')}</span>
          </div>
        ) : providers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {providers.map(p => {
              const active = query.watchProviders?.includes(p.provider_id) ?? false;
              return (
                <button
                  key={p.provider_id}
                  type="button"
                  title={p.provider_name}
                  aria-label={p.provider_name}
                  aria-pressed={active}
                  onClick={() => toggleProvider(p.provider_id)}
                  className={clsx(
                    'w-11 h-11 p-0 rounded-lg overflow-hidden border-2 bg-white/[0.05] flex items-center justify-center transition-[opacity,border-color]',
                    active ? 'border-ndp-accent opacity-100' : 'border-transparent opacity-[0.55] hover:opacity-80',
                  )}
                >
                  {p.logo_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[10px] text-ndp-text-muted">{p.provider_name.slice(0, 2)}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ndp-text-dim">{t('admin.homepage.watch_providers_empty', 'No providers available.')}</p>
        )}
      </div>

      {/* Release window + Year range + Rating + Votes row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="col-span-2 sm:col-span-1 min-w-0">
          <label htmlFor={`${fieldId}-release-window`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
            {t('admin.homepage.release_window', 'Released within')}
          </label>
          <select
            id={`${fieldId}-release-window`}
            className="input w-full text-sm"
            value={query.releasedWithin || ''}
            onChange={e => {
              const val = e.target.value || undefined;
              // Clear year fields when using a relative window
              onChange({ ...query, releasedWithin: val, yearGte: val ? undefined : query.yearGte, yearLte: val ? undefined : query.yearLte });
            }}
          >
            {RELEASE_WINDOW_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-year-from`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
            {t('admin.homepage.year_from', 'Year from')}
          </label>
          <input
            id={`${fieldId}-year-from`}
            className={clsx('input w-full text-sm', query.releasedWithin && 'opacity-40')}
            type="number"
            placeholder="2020"
            value={query.yearGte ?? ''}
            disabled={!!query.releasedWithin}
            onChange={e => onChange({ ...query, yearGte: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-year-to`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
            {t('admin.homepage.year_to', 'Year to')}
          </label>
          <input
            id={`${fieldId}-year-to`}
            className={clsx('input w-full text-sm', query.releasedWithin && 'opacity-40')}
            type="number"
            placeholder="2026"
            value={query.yearLte ?? ''}
            disabled={!!query.releasedWithin}
            onChange={e => onChange({ ...query, yearLte: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-min-rating`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
            {t('admin.homepage.min_rating', 'Min. rating')}
          </label>
          <input
            id={`${fieldId}-min-rating`}
            className="input w-full text-sm"
            type="number"
            min={0}
            max={10}
            step={0.5}
            placeholder="0"
            value={query.voteAverageGte ?? ''}
            onChange={e => onChange({ ...query, voteAverageGte: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-min-votes`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
            {t('admin.homepage.min_votes', 'Min. votes')}
          </label>
          <input
            id={`${fieldId}-min-votes`}
            className="input w-full text-sm"
            type="number"
            min={0}
            step={10}
            placeholder="0"
            value={query.voteCountGte ?? ''}
            onChange={e => onChange({ ...query, voteCountGte: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
      </div>

      {/* Sort + Language row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-sort`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
            {t('admin.homepage.sort_by', 'Sort by')}
          </label>
          <select
            id={`${fieldId}-sort`}
            className="input w-full text-sm"
            value={query.sortBy || 'popularity.desc'}
            onChange={e => onChange({ ...query, sortBy: e.target.value })}
          >
            {(query.mediaType === 'tv' ? TV_SORT_OPTIONS : MOVIE_SORT_OPTIONS).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-language`} className="block mb-1.5 text-xs font-medium text-ndp-text-muted">
            {t('admin.homepage.language', 'Language')}
          </label>
          <select
            id={`${fieldId}-language`}
            className="input w-full text-sm"
            value={query.language || ''}
            onChange={e => onChange({ ...query, language: e.target.value || undefined })}
          >
            {LANGUAGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Preview, region of results, labelled via aria. Not a form control. */}
      <div role="region" aria-labelledby={`${fieldId}-preview`} className="min-w-0">
        <span id={`${fieldId}-preview`} className="flex items-center gap-2 mb-2 text-xs font-medium text-ndp-text-muted">
          {t('admin.homepage.preview', 'Preview')}
          {previewLoading && (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
        </span>
        {previewResults.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-2 edge-fade-x [scrollbar-width:thin]">
            {previewResults.slice(0, 12).map((item: any) => (
              <div key={item.id} className="flex-shrink-0 w-[100px]">
                <div className="poster-frame w-[100px] h-[150px]">
                  {item.poster_path ? (
                    <img
                      src={posterUrl(item.poster_path, 'w185')}
                      alt={item.title || item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-ndp-text-dim">
                      No poster
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-center text-ndp-text truncate">
                  {item.title || item.name}
                </p>
              </div>
            ))}
          </div>
        ) : !previewLoading ? (
          <p className="text-xs text-ndp-text-dim py-3">
            {t('admin.homepage.preview_empty', 'Adjust the filters above to see a preview.')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
