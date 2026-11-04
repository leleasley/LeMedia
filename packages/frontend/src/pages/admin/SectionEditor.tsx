import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import api from '@/lib/api';
import { QueryBuilder, type DiscoverQuery } from './QueryBuilder';
import Switch from '@/components/ui/Switch';

interface HomepageSection {
  id: string;
  title: string;
  type: 'builtin' | 'custom';
  enabled: boolean;
  size?: 'default' | 'large';
  builtinKey?: string;
  endpoint?: string; // Raw GET endpoint for custom sections (e.g. /tmdb/movies/now_playing)
  query?: {
    mediaType?: string;
    genres?: number[];
    yearGte?: number;
    yearLte?: number;
    voteAverageGte?: number;
    voteCountGte?: number;
    sortBy?: string;
    language?: string;
    releasedWithin?: string;
    watchProviders?: number[];
    watchRegion?: string;
    [key: string]: unknown;
  };
}

interface SectionEditorProps {
  section: HomepageSection | null; // null = new custom section
  onSave: (section: HomepageSection) => void;
  onClose: () => void;
}

const FIELD_LABEL = 'block mb-1.5 text-xs font-medium text-ndp-text-muted';
const SEGMENTED = 'inline-flex gap-1 p-1 rounded-lg bg-white/[0.05] ring-1 ring-inset ring-white/[0.06]';
const segmentClass = (active: boolean) =>
  `min-h-[34px] px-4 rounded-md text-[13px] font-semibold transition-colors ${
    active ? 'bg-ndp-accent text-white' : 'text-ndp-text-dim hover:text-ndp-text'
  }`;

const DEFAULT_QUERY: DiscoverQuery = {
  mediaType: 'movie',
  genres: [],
  sortBy: 'popularity.desc',
};

export function SectionEditor({ section, onSave, onClose }: Readonly<SectionEditorProps>) {
  const { t } = useTranslation();
  const isNew = section === null;
  const isBuiltin = section?.type === 'builtin';
  const fieldId = useId();

  const [title, setTitle] = useState(section?.title || '');
  const [size, setSize] = useState<'default' | 'large'>(section?.size || 'default');
  const [enabled, setEnabled] = useState(section?.enabled ?? true);
  const [customMode, setCustomMode] = useState<'discover' | 'endpoint'>(section?.endpoint ? 'endpoint' : 'discover');
  const [endpoint, setEndpoint] = useState(section?.endpoint || '');
  const [endpointPreview, setEndpointPreview] = useState<any[]>([]);
  const [endpointPreviewLoading, setEndpointPreviewLoading] = useState(false);
  const [query, setQuery] = useState<DiscoverQuery>(() => {
    if (section?.query) {
      return {
        mediaType: (section.query.mediaType as 'movie' | 'tv') || 'movie',
        genres: section.query.genres?.map(Number) || [],
        yearGte: section.query.yearGte,
        yearLte: section.query.yearLte,
        voteAverageGte: section.query.voteAverageGte,
        sortBy: section.query.sortBy || 'popularity.desc',
        language: section.query.language,
        watchProviders: section.query.watchProviders?.map(Number) || [],
        watchRegion: section.query.watchRegion,
      };
    }
    return { ...DEFAULT_QUERY };
  });
  const [previewResults, setPreviewResults] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview fetch
  const fetchPreview = useCallback(async (q: DiscoverQuery) => {
    setPreviewLoading(true);
    try {
      const { data } = await api.post('/admin/homepage/preview', {
        mediaType: q.mediaType,
        genres: q.genres?.length ? q.genres : undefined,
        yearGte: q.yearGte,
        yearLte: q.yearLte,
        voteAverageGte: q.voteAverageGte,
        sortBy: q.sortBy,
        language: q.language,
        watchProviders: q.watchProviders?.length ? q.watchProviders : undefined,
        watchRegion: q.watchRegion,
      });
      setPreviewResults(data.results || []);
    } catch (err) {
      console.error('Preview fetch failed', err);
      setPreviewResults([]);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Auto-preview for custom sections when query changes
  useEffect(() => {
    if (isBuiltin || customMode !== 'discover') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPreview(query);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isBuiltin, customMode, fetchPreview]);

  // Auto-preview for endpoint mode
  useEffect(() => {
    if (isBuiltin || customMode !== 'endpoint' || !endpoint) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setEndpointPreviewLoading(true);
      try {
        const { data } = await api.get(endpoint);
        setEndpointPreview(Array.isArray(data) ? data : data.results || []);
      } catch {
        setEndpointPreview([]);
      } finally {
        setEndpointPreviewLoading(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [endpoint, isBuiltin, customMode]);

  const handleSave = () => {
    let saved: HomepageSection;
    if (isBuiltin) {
      saved = { ...section, title, size, enabled };
    } else if (customMode === 'endpoint') {
      saved = {
        id: section?.id || crypto.randomUUID(),
        title: title || 'Custom Section',
        type: 'custom',
        enabled,
        size,
        endpoint: endpoint.startsWith('/') ? endpoint : `/${endpoint}`,
      };
    } else {
      saved = {
        id: section?.id || crypto.randomUUID(),
        title: title || 'Custom Section',
        type: 'custom',
        enabled,
        size,
        query: {
          mediaType: query.mediaType,
          genres: query.genres?.length ? query.genres : undefined,
          yearGte: query.yearGte,
          yearLte: query.yearLte,
          releasedWithin: query.releasedWithin,
          voteAverageGte: query.voteAverageGte,
          voteCountGte: query.voteCountGte,
          sortBy: query.sortBy,
          language: query.language,
          watchProviders: query.watchProviders?.length ? query.watchProviders : undefined,
          watchRegion: query.watchRegion,
        },
      };
    }
    onSave(saved);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', handleKey);
    return () => globalThis.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay z-50"
      onClick={onClose}
    >
      <div
        className="modal-panel"
        style={{
          maxWidth: 1024,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pl-5 pr-3 pt-4 pb-3 sm:py-3 border-b border-white/[0.06] flex-shrink-0">
          <h3 className="text-base font-semibold text-ndp-text truncate">
            {isNew
              ? t('admin.homepage.new_section', 'New custom section')
              : t('admin.homepage.edit_section', 'Edit section')}
          </h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 sm:items-end">
              {/* Title */}
              <div className="min-w-0">
                <label htmlFor={`${fieldId}-title`} className={FIELD_LABEL}>
                  {t('admin.homepage.section_title', 'Section title')}
                </label>
                <input
                  id={`${fieldId}-title`}
                  className="input w-full py-2.5 text-sm"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={t('admin.homepage.title_placeholder', 'e.g. Best of 2025')}
                />
              </div>

              {/* Size selector */}
              <div>
                <label className={FIELD_LABEL}>
                  {t('admin.homepage.card_size', 'Card size')}
                </label>
                <div className={SEGMENTED}>
                  <button type="button" onClick={() => setSize('default')} className={segmentClass(size === 'default')}>
                    {t('admin.homepage.size_default', 'Default')}
                  </button>
                  <button type="button" onClick={() => setSize('large')} className={segmentClass(size === 'large')}>
                    {t('admin.homepage.size_large', 'Large')}
                  </button>
                </div>
              </div>
            </div>

            {/* Enabled toggle (always shown for builtin, also for custom) */}
            {isBuiltin && (
              <div className="admin-group">
                <div className="admin-row justify-between">
                  <span className="text-sm text-ndp-text">
                    {enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')}
                  </span>
                  <Switch checked={enabled} onChange={(next) => setEnabled(next)} label={enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')} className="-mr-1.5" />
                </div>
              </div>
            )}

            {/* Custom section mode selector + content */}
            {!isBuiltin && (
              <>
                <div className="border-t border-white/[0.06] pt-5">
                  {/* Mode toggle */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
                    <p className="text-xs font-medium text-ndp-text-muted">{t('admin.homepage.source', 'Data source')}</p>
                    <div className={SEGMENTED}>
                      <button type="button" onClick={() => setCustomMode('discover')} className={segmentClass(customMode === 'discover')}>
                        {t('admin.homepage.mode_discover', 'Discover')}
                      </button>
                      <button type="button" onClick={() => setCustomMode('endpoint')} className={segmentClass(customMode === 'endpoint')}>
                        {t('admin.homepage.mode_endpoint', 'Endpoint')}
                      </button>
                    </div>
                  </div>

                  {/* Endpoint mode */}
                  {customMode === 'endpoint' && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className={FIELD_LABEL}>
                          {t('admin.homepage.endpoint_url', 'API endpoint')}
                        </label>
                        <input
                          className="input w-full py-2.5 font-mono text-[13px]"
                          type="text"
                          value={endpoint}
                          onChange={e => setEndpoint(e.target.value)}
                          placeholder="/tmdb/movies/now_playing"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'Now Playing', value: '/tmdb/movies/now_playing' },
                          { label: 'Top Rated Movies', value: '/tmdb/movies/top_rated' },
                          { label: 'Top Rated TV', value: '/tmdb/tv/top_rated' },
                          { label: 'Airing Today', value: '/tmdb/tv/airing_today' },
                          { label: 'On The Air', value: '/tmdb/tv/on_the_air' },
                        ].map(preset => (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => { setEndpoint(preset.value); if (!title) setTitle(preset.label); }}
                            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium ring-1 ring-inset transition-colors ${
                              endpoint === preset.value
                                ? 'bg-ndp-accent/10 ring-ndp-accent/40 text-ndp-accent'
                                : 'ring-white/10 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      {/* Endpoint preview */}
                      <div>
                        <label className={FIELD_LABEL}>
                          {t('admin.homepage.preview', 'Preview')}
                          {endpointPreviewLoading && <span className="ml-2 text-ndp-text-dim">...</span>}
                        </label>
                        {endpointPreview.length > 0 ? (
                          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                            {endpointPreview.slice(0, 10).map((item: any) => (
                              <div key={item.id} className="flex-shrink-0 w-20 text-center">
                                {item.poster_path ? (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w154${item.poster_path}`}
                                    alt=""
                                    className="w-20 h-[120px] object-cover rounded-md bg-ndp-surface-light"
                                  />
                                ) : (
                                  <div className="w-20 h-[120px] rounded-md bg-white/5 flex items-center justify-center">
                                    <span className="text-ndp-text-dim text-[10px]">No poster</span>
                                  </div>
                                )}
                                <p className="text-ndp-text-dim text-[10px] mt-1 truncate">
                                  {item.title || item.name}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : endpoint && !endpointPreviewLoading ? (
                          <p className="text-ndp-text-dim text-xs">{t('admin.homepage.preview_empty', 'No results or invalid endpoint.')}</p>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Discover mode */}
                  {customMode === 'discover' && (
                    <>
                      <p className="text-xs font-medium text-ndp-text-muted mb-3">
                        {t('admin.homepage.query_builder', 'TMDB discover query')}
                      </p>
                      <QueryBuilder
                        query={query}
                        onChange={setQuery}
                        previewResults={previewResults}
                        previewLoading={previewLoading}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 sm:px-5 pt-3 pb-1 sm:pb-3 border-t border-white/[0.06] flex-shrink-0">
          <button
            onClick={onClose}
            className="btn-secondary text-sm px-5 py-2"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            className="btn-primary text-sm px-5 py-2"
          >
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
