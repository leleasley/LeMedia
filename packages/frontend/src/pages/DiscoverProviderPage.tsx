import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';
import MediaGrid from '@/components/MediaGrid';
import FilterBar, { DEFAULT_FILTERS, type FilterValues } from '@/components/FilterBar';
import { useMediaStatus } from '@/hooks/useMediaStatus';
import { usePaginatedDiscovery } from '@/hooks/usePaginatedDiscovery';
import { useWatchProviders } from '@/hooks/useWatchProviders';
import { buildDiscoverParams } from '@/utils/buildDiscoverParams';
import type { TmdbMedia } from '@/types';
import { Spinner } from '@/components/Spinner';

const SORT_OPTIONS_MOVIE = [
  { value: 'popularity.desc', labelKey: 'filter.sort_popularity' },
  { value: 'vote_average.desc', labelKey: 'filter.sort_rating' },
  { value: 'primary_release_date.desc', labelKey: 'filter.sort_newest' },
  { value: 'primary_release_date.asc', labelKey: 'filter.sort_oldest' },
];

const SORT_OPTIONS_TV = [
  { value: 'popularity.desc', labelKey: 'filter.sort_popularity' },
  { value: 'vote_average.desc', labelKey: 'filter.sort_rating' },
  { value: 'first_air_date.desc', labelKey: 'filter.sort_newest' },
  { value: 'first_air_date.asc', labelKey: 'filter.sort_oldest' },
];

export default function DiscoverProviderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mediaType, providerId } = useParams<{ mediaType: string; providerId: string }>();
  const [filters, setFilters] = useState<FilterValues>({ ...DEFAULT_FILTERS });
  const sentinelRef = useRef<HTMLDivElement>(null);

  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const { providers } = useWatchProviders();
  const provider = providers.find((p) => String(p.provider_id) === providerId);
  const providerName = provider?.provider_name ?? t('home.streaming');

  // Reset filters when the route changes
  useEffect(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, [mediaType, providerId]);

  const switchType = useCallback(
    (next: 'movie' | 'tv') => {
      if (next !== type) navigate(`/discover/${next}/provider/${providerId}`);
    },
    [navigate, providerId, type],
  );

  const buildUrl = useCallback(
    (page: number) => {
      const fp = buildDiscoverParams(filters);
      return `/tmdb/discover/${type}?page=${page}&with_watch_providers=${providerId}&watch_region=GB${fp}`;
    },
    [type, providerId, filters],
  );

  const mapResult = useCallback(
    (r: TmdbMedia): TmdbMedia => ({ ...r, media_type: type }),
    [type],
  );

  const { results, loading, loadingMore, transitioning, page, totalPages } =
    usePaginatedDiscovery({
      buildUrl,
      filters,
      sentinelRef,
      routeKey: `${type}:provider:${providerId}`,
      mapResult,
    });

  // Client-side "hide requested" filter (only one that needs status data)
  const statuses = useMediaStatus(results);
  const displayResults = useMemo(() => {
    if (!filters.hideRequested) return results;
    return results.filter((item) => {
      const itemType = item.media_type || (item.title ? 'movie' : 'tv');
      const key = `${itemType}:${item.id}`;
      if (!(key in statuses)) return false;
      return statuses[key].statusCategory === 'UNAVAILABLE';
    });
  }, [results, filters.hideRequested, statuses]);

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 pt-4 pb-16">
      <div className="flex justify-end mb-1">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 flex-shrink-0">
          {(['movie', 'tv'] as const).map((mt) => (
            <button
              key={mt}
              type="button"
              onClick={() => switchType(mt)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                type === mt ? 'bg-ndp-accent text-white' : 'text-ndp-text-dim hover:text-ndp-text',
              )}
            >
              {mt === 'movie' ? t('common.movie') : t('common.series')}
            </button>
          ))}
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        sortOptions={type === 'movie' ? SORT_OPTIONS_MOVIE : SORT_OPTIONS_TV}
        title={providerName}
        subtitle={type === 'movie' ? t('discover.movies') : t('discover.series')}
        backButton={
          <span className="flex items-center gap-2 flex-shrink-0">
            <Link to="/" className="p-2 glass rounded-xl hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-5 h-5 text-white" />
            </Link>
            {provider?.logo_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                alt=""
                className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/10"
              />
            ) : null}
          </span>
        }
      />

      <div className={clsx('transition-opacity duration-300', transitioning && 'opacity-40 pointer-events-none')}>
        <MediaGrid media={displayResults} loading={loading} />
      </div>

      {!loading && page < totalPages && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loadingMore && <Spinner />}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="text-center py-20">
          <p className="text-ndp-text-muted text-lg">{t('discover.no_results')}</p>
        </div>
      )}
    </div>
  );
}
