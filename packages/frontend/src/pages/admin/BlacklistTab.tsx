import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Trash2, ShieldBan, Search, Film, X } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useModal } from '@/hooks/useModal';

interface BlacklistEntry {
  id: number;
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  reason: string | null;
  createdAt: string;
  createdBy?: { id: number; displayName: string | null } | null;
}

interface TmdbResult {
  id: number;
  title?: string;
  name?: string;
  media_type: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

export function BlacklistTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchRef = useRef<HTMLDivElement>(null);

  // Confirm modal
  const [confirmMedia, setConfirmMedia] = useState<TmdbResult | null>(null);
  const { dialogRef: confirmDialogRef, titleId: confirmTitleId } = useModal({
    open: confirmMedia !== null,
    onClose: () => setConfirmMedia(null),
  });
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchEntries = () => {
    api.get('/admin/blacklist')
      .then(({ data }) => setEntries(data))
      .catch((err) => toastApiError(err, t('admin.blacklist.load_failed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEntries(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    clearTimeout(searchTimeout.current);
    if (!value.trim()) { setResults([]); setShowResults(false); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(`/tmdb/search?q=${encodeURIComponent(value.trim())}`);
        setResults((data.results || []).filter((r: TmdbResult) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 6));
        setShowResults(true);
      } catch (err) {
        // Don't let a failed TMDB call look like "no results" — toast + empty the list so the
        // admin knows it's a provider issue, not an actual absence.
        toastApiError(err, t('admin.blacklist.search_failed'));
        setResults([]);
      }
      finally { setSearching(false); }
    }, 400);
  };

  const handleAdd = async () => {
    if (!confirmMedia) return;
    setAdding(true);
    const mediaType = confirmMedia.media_type === 'tv' ? 'tv' : 'movie';
    const title = confirmMedia.title || confirmMedia.name || 'Unknown';
    try {
      await api.post('/admin/blacklist', { tmdbId: confirmMedia.id, mediaType, title, posterPath: confirmMedia.poster_path, reason: reason.trim() || undefined });
      setConfirmMedia(null);
      setReason('');
      setQuery('');
      setResults([]);
      fetchEntries();
    } catch (err) { toastApiError(err, t('admin.blacklist.add_failed')); }
    finally { setAdding(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.delete(`/admin/blacklist/${id}`);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) { toastApiError(err, t('admin.blacklist.delete_failed')); }
    finally { setDeleting(null); }
  };

  const isBlocked = (tmdbId: number, mediaType: string) =>
    entries.some(e => e.tmdbId === tmdbId && e.mediaType === mediaType);

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout title={t('admin.blacklist.title')} count={entries.length}>

      {/* Search bar */}
      <div ref={searchRef} className="relative mb-5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim pointer-events-none" />
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder={t('admin.blacklist.search_placeholder')}
            className="input w-full text-sm py-2.5 pl-10 pr-10"
          />
          {searching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim animate-spin" />}
        </div>

        {/* Results dropdown */}
        {showResults && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-ndp-surface border border-white/[0.08] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] z-20 overflow-hidden divide-y divide-white/[0.06]">
            {results.map(r => {
              const title = r.title || r.name || 'Unknown';
              const year = (r.release_date || r.first_air_date || '').slice(0, 4);
              const type = r.media_type === 'tv' ? 'tv' : 'movie';
              const blocked = isBlocked(r.id, type);
              return (
                <button
                  key={`${r.media_type}-${r.id}`}
                  onClick={() => {
                    if (blocked) return;
                    setConfirmMedia(r);
                    setReason('');
                    setShowResults(false);
                  }}
                  disabled={blocked}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 min-h-[56px] text-left transition-colors',
                    blocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.04] active:bg-white/[0.06]',
                  )}
                >
                  <div className="w-8 h-12 rounded-md overflow-hidden flex-shrink-0 bg-ndp-surface-light ring-1 ring-inset ring-white/[0.06]">
                    {r.poster_path ? (
                      <img src={posterUrl(r.poster_path, 'w92')} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Film className="w-3 h-3 text-ndp-text-dim" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ndp-text truncate">{title}</p>
                    <p className="text-xs text-ndp-text-dim">{type === 'tv' ? 'Series' : 'Movie'}{year && ` · ${year}`}</p>
                  </div>
                  {blocked && (
                    <ShieldBan className="w-4 h-4 text-ndp-danger flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmMedia && createPortal(
        <div className="modal-overlay z-50" onClick={() => setConfirmMedia(null)}>
          <div
            ref={confirmDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            className="modal-panel px-5 pt-6 pb-5 sm:p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 id={confirmTitleId} className="text-base font-semibold text-ndp-text flex items-center gap-2 min-w-0">
                <ShieldBan className="w-4 h-4 text-ndp-danger flex-shrink-0" />
                {t('admin.blacklist.confirm_title')}
              </h3>
              <button
                onClick={() => setConfirmMedia(null)}
                className="w-10 h-10 -mr-2 flex items-center justify-center flex-shrink-0 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/[0.06] transition-colors"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-ndp-surface-light border border-white/[0.06]">
              <div className="w-12 h-[72px] rounded-md overflow-hidden flex-shrink-0 bg-ndp-surface ring-1 ring-inset ring-white/[0.06]">
                {confirmMedia.poster_path ? (
                  <img src={posterUrl(confirmMedia.poster_path, 'w185')} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Film className="w-5 h-5 text-ndp-text-dim" /></div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ndp-text break-words">{confirmMedia.title || confirmMedia.name}</p>
                <p className="text-xs text-ndp-text-dim mt-0.5">
                  {confirmMedia.media_type === 'tv' ? 'Series' : 'Movie'}
                  {(confirmMedia.release_date || confirmMedia.first_air_date) && ` · ${(confirmMedia.release_date || confirmMedia.first_air_date || '').slice(0, 4)}`}
                </p>
              </div>
            </div>

            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('admin.blacklist.reason_placeholder')}
              className="input w-full text-sm mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmMedia(null)} className="btn-secondary text-sm px-4 py-2">
                {t('common.cancel')}
              </button>
              <button onClick={handleAdd} disabled={adding} className="btn-danger text-sm px-4 py-2 flex items-center gap-1.5">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldBan className="w-3.5 h-3.5" />}
                {t('admin.blacklist.block')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* List */}
      {entries.length === 0 ? (
        <div className="admin-group px-6 py-10 text-center">
          <div className="admin-icon-tile w-10 h-10 mx-auto mb-3 text-ndp-text-dim">
            <ShieldBan className="w-5 h-5" />
          </div>
          <p className="text-sm text-ndp-text-muted">{t('admin.blacklist.empty')}</p>
        </div>
      ) : (
        <div className="admin-group divide-y divide-white/[0.06]">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <div className="relative w-10 h-[60px] rounded-md overflow-hidden flex-shrink-0 bg-ndp-surface-light ring-1 ring-inset ring-white/[0.06]">
                {entry.posterPath ? (
                  <img src={posterUrl(entry.posterPath, 'w185')} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Film className="w-4 h-4 text-ndp-text-dim" /></div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-ndp-text min-w-0">
                  <ShieldBan className="w-3.5 h-3.5 text-ndp-danger flex-shrink-0" />
                  <span className="line-clamp-2 break-words">{entry.title}</span>
                </p>
                {entry.reason && <p className="text-xs text-ndp-text-dim truncate mt-0.5">{entry.reason}</p>}
              </div>

              <button
                onClick={() => handleDelete(entry.id)}
                disabled={deleting === entry.id}
                className="btn-danger flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-xs disabled:opacity-60"
              >
                {deleting === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {t('admin.blacklist.unblock')}
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminTabLayout>
  );
}
