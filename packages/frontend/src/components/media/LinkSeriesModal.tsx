import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Link2, Loader2, Search, Unlink, X } from 'lucide-react';
import api from '@/lib/api';
import { showToast } from '@/utils/toast';

interface Candidate {
  tvdbId: number;
  title: string;
  year: number | null;
  tmdbId: number | null;
  imdbId: string | null;
  seasonCount: number;
  inLibrary: boolean;
  tmdbMismatch: boolean;
}

interface Props {
  tmdbId: number;
  title: string;
  /** The TVDB id currently stored on the row, if any. */
  currentTvdbId?: number | null;
  /** True when that id was set by an admin (rather than inferred from TMDB). */
  linkedManually?: boolean;
  onClose: () => void;
  /** Called after a link or unlink succeeded, so the page can refresh. */
  onChanged?: () => void;
}

/**
 * Admin-only picker for the case TMDB and TVDB disagree about a show's identity.
 *
 * Sonarr answers `tmdb:<id>` with an empty list for split shows (Top Boy 2019), so the request
 * pipeline can never resolve one on its own. This lets an admin point the title at the right
 * TVDB series once; the stored id then outranks the TMDB mapping for dispatch and sync.
 */
export default function LinkSeriesModal({ tmdbId, title, currentTvdbId, linkedManually, onClose, onChanged }: Readonly<Props>) {
  const { t } = useTranslation();
  const [term, setTerm] = useState(title);
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Candidate[]>('/admin/series-link/candidates', {
        params: { term: query.trim(), tmdbId: String(tmdbId) },
      });
      setResults(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setResults([]);
      setError(err?.response?.data?.error || t('media.link_series.search_failed', 'Sonarr lookup failed'));
    } finally {
      setLoading(false);
    }
  }, [tmdbId, t]);

  useEffect(() => { void search(title); }, [search, title]);

  const link = async (candidate: Candidate) => {
    setBusy(true);
    try {
      await api.post('/admin/series-link', { tmdbId, tvdbId: candidate.tvdbId });
      showToast(
        t('media.link_series.linked', 'Linked to {{title}} (TVDB {{tvdbId}})', { title: candidate.title, tvdbId: candidate.tvdbId }),
        'success',
      );
      onChanged?.();
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.error || t('media.link_series.link_failed', 'Could not link the series'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/series-link/${tmdbId}`);
      showToast(t('media.link_series.unlinked', 'Manual link removed'), 'success');
      onChanged?.();
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.error || t('media.link_series.link_failed', 'Could not link the series'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay z-50" onClick={onClose}>
      <div className="modal-panel p-6 max-w-2xl w-full max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="text-lg font-bold text-ndp-text flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              {t('media.link_series.title', 'Link to a Sonarr series')}
            </h2>
            <p className="text-sm text-ndp-text-muted mt-1">
              {t('media.link_series.hint', 'Use this when TMDB and TVDB disagree about a show. The link follows TVDB season numbering.')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-2 rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {linkedManually && currentTvdbId ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20 text-emerald-200 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              {t('media.link_series.current', 'Linked to TVDB {{tvdbId}}.', { tvdbId: currentTvdbId })}
            </span>
            <button type="button" onClick={unlink} disabled={busy} className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5 disabled:opacity-50">
              <Unlink className="w-3.5 h-3.5" />
              {t('media.link_series.unlink', 'Remove link')}
            </button>
          </div>
        ) : currentTvdbId ? (
          <p className="mt-4 text-xs text-ndp-text-muted">
            {t('media.link_series.inferred', 'Currently using TVDB {{tvdbId}} from TMDB metadata.', { tvdbId: currentTvdbId })}
          </p>
        ) : null}

        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); void search(term); }}
        >
          <input
            className="input flex-1"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('media.link_series.placeholder', 'Title or TVDB id')}
            aria-label={t('media.link_series.placeholder', 'Title or TVDB id')}
          />
          <button type="submit" className="btn-secondary flex items-center gap-2 !px-4" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {t('common.search', 'Search')}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-ndp-danger">{error}</p>}

        <ul className="mt-4 space-y-2">
          {!loading && !error && results.length === 0 && (
            <li className="text-sm text-ndp-text-muted py-6 text-center">
              {t('media.link_series.empty', 'No Sonarr series matched that search.')}
            </li>
          )}
          {results.map((candidate) => {
            const isCurrent = candidate.tvdbId === currentTvdbId;
            return (
              <li key={candidate.tvdbId} className="rounded-lg ring-1 ring-inset ring-white/10 p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ndp-text truncate">
                    {candidate.title}
                    {candidate.year ? <span className="text-ndp-text-muted font-normal"> ({candidate.year})</span> : null}
                  </p>
                  <p className="text-xs text-ndp-text-muted mt-0.5">
                    TVDB {candidate.tvdbId}
                    {candidate.imdbId ? ` · ${candidate.imdbId}` : ''}
                    {candidate.seasonCount > 0
                      ? ` · ${t('media.link_series.seasons', '{{count}} seasons', { count: candidate.seasonCount })}`
                      : ''}
                  </p>
                  {candidate.tmdbMismatch && (
                    <p className="text-xs text-amber-300/90 mt-1">
                      {t('media.link_series.mismatch', 'TVDB’s TMDB id is {{theirs}} (this title is {{ours}}). Expected for split shows — seasons follow TVDB numbering.', {
                        theirs: candidate.tmdbId, ours: tmdbId,
                      })}
                    </p>
                  )}
                </div>
                {candidate.inLibrary && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                    {t('media.link_series.in_library', 'In Sonarr')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => link(candidate)}
                  disabled={busy || isCurrent}
                  className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50"
                >
                  {isCurrent
                    ? t('media.link_series.already_linked', 'Linked')
                    : t('media.link_series.action', 'Link')}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
