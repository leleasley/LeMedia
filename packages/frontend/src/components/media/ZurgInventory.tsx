import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Cloud, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';

interface ZurgSeason {
  season: number;
  episodes: number[];
  files: number;
}

interface SonarrSeason {
  seasonNumber: number;
  episodeCount: number | null;
  episodeFileCount: number | null;
}

interface Props {
  tmdbId: number;
  /** Sonarr's season list (null when Sonarr is not configured for this title). */
  sonarrSeasons: SonarrSeason[] | null;
  onRequestSeasons: (seasons: number[]) => void | Promise<unknown>;
  requesting?: boolean;
  readOnly?: boolean;
  /** Sonarr's internal series id, when this show is already in Sonarr. */
  sonarrSeriesId?: number | null;
}

const HOURS = 3600_000;

/**
 * What Zurg actually holds for this series, against what Sonarr has.
 *
 * Zurg's `__magic__/tv/<Show>/Season NN` layout is the debrid-side truth: it shows seasons and
 * episodes that never reached Sonarr, which a series-level "is it in Sonarr?" check cannot see.
 * Reading it on demand (cached six hours) keeps it exact without scanning every show.
 */
export function ZurgInventory({ tmdbId, sonarrSeasons, onRequestSeasons, requesting, readOnly, sonarrSeriesId }: Readonly<Props>) {
  const { t } = useTranslation();
  const [seasons, setSeasons] = useState<ZurgSeason[] | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [removeSeason, setRemoveSeason] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const { data } = await api.get<{ seasons: ZurgSeason[]; path: string | null; fetchedAt: string | null }>(
        `/media/${tmdbId}/zurg-inventory${fresh ? '?fresh=1' : ''}`,
      );
      setSeasons(Array.isArray(data.seasons) ? data.seasons : []);
      setPath(data.path ?? null);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || t('media.zurg_inventory_failed', 'Could not read Zurg’s library'));
    } finally {
      setLoading(false);
    }
  }, [tmdbId, t]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !seasons) {
    return (
      <section className="mt-10">
        <div className="admin-group admin-row justify-center py-8 text-sm text-ndp-text-dim"><Spinner size="sm" />{t('common.loading')}</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-10">
        <div className="admin-group admin-row text-sm text-ndp-danger">{error}</div>
      </section>
    );
  }

  if (!seasons) return null;

  if (seasons.length === 0) {
    // Zurg knows the show folder but lists no files in it — usually an unindexed release. Say so
    // instead of staying silent, or the page looks like Zurg has nothing at all.
    if (!path) return null;
    return (
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-xl font-bold text-ndp-text inline-flex items-center gap-2">
            <Cloud className="w-5 h-5 text-sky-400" />
            {t('media.zurg_inventory_title', 'In your Zurg library')}
          </h2>
          <button type="button" onClick={() => void load(true)} disabled={loading} className="btn-secondary !px-2.5 !py-1.5 !text-xs flex items-center gap-1.5 disabled:opacity-50">
            {loading ? <Spinner size="sm" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {t('admin.dmm.refresh', 'Refresh')}
          </button>
        </div>
        <p className="admin-hint">
          {t('media.zurg_inventory_empty', 'Zurg lists {{path}} but exposes no episode files in it — usually a release it has not indexed yet.', { path })}
        </p>
      </section>
    );
  }

  const bySeason = new Map((sonarrSeasons ?? []).map((s) => [s.seasonNumber, s]));
  const rows = seasons.map((s) => {
    const sonarr = bySeason.get(s.season);
    const zurgCount = s.episodes.length || s.files;
    const have = sonarr?.episodeFileCount ?? 0;
    return {
      ...s,
      zurgCount,
      have,
      state: !sonarr ? ('absent' as const)
        : have <= 0 ? ('empty' as const)
          : zurgCount > 0 && have < zurgCount ? ('partial' as const)
            : ('complete' as const),
    };
  });
  // Specials (season 0) cannot be requested through the normal season path.
  // A season Sonarr lacks entirely (or has with no files) is worth adding whatever Zurg shows —
  // monitoring it is what lets an acquisition source pick it up. A partly-present season is only
  // added when Zurg shows files the *arr is missing.
  const toRequest = rows
    .filter((r) => r.season > 0 && (r.state === 'absent' || r.state === 'empty' || (r.state === 'partial' && r.zurgCount > 0)))
    .map((r) => r.season);
  const totalEpisodes = rows.reduce((n, r) => n + r.zurgCount, 0);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xl font-bold text-ndp-text inline-flex items-center gap-2">
          <Cloud className="w-5 h-5 text-sky-400" />
          {t('media.zurg_inventory_title', 'In your Zurg library')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ndp-text-dim">
            {t('media.zurg_inventory_summary', '{{seasons}} season(s) · {{episodes}} episode(s)', { seasons: rows.length, episodes: totalEpisodes })}
          </span>
          <button type="button" onClick={() => void load(true)} disabled={loading} className="btn-secondary !px-2.5 !py-1.5 !text-xs flex items-center gap-1.5 disabled:opacity-50">
            {loading ? <Spinner size="sm" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {t('admin.dmm.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06] bg-ndp-surface">
        {rows.map((row) => (
          <div key={row.season} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="text-sm font-medium text-ndp-text w-24 shrink-0">
              {row.season === 0 ? t('media.zurg_specials', 'Specials') : t('media.season_n', 'Season {{n}}', { n: row.season })}
            </span>
            <span className="text-xs text-ndp-text-muted flex-1 min-w-0">
              {t('media.zurg_episodes', '{{n}} episode(s) in Zurg', { n: row.zurgCount })}
              {sonarrSeasons && row.season > 0 && (
                <> · {t('media.zurg_in_sonarr', '{{n}} in Sonarr', { n: row.have })}</>
              )}
            </span>
            {row.zurgCount === 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-ndp-text-dim">
                {t('media.zurg_state_nofiles', 'no files listed')}
              </span>
            )}
            {sonarrSeasons && row.season > 0 && row.state !== 'complete' && (
              <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-md',
                row.state === 'partial' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300')}
              >
                {row.state === 'partial'
                  ? t('media.zurg_state_partial', 'partly in Sonarr')
                  : row.state === 'empty'
                    ? t('media.zurg_state_empty', 'nothing in Sonarr')
                    : t('media.zurg_state_absent', 'not in Sonarr')}
              </span>
            )}
            {sonarrSeasons && row.season > 0 && row.state === 'complete' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300">
                {t('media.zurg_state_complete', 'in Sonarr')}
              </span>
            )}
            {!readOnly && sonarrSeriesId && row.season > 0 && row.state !== 'absent' && (
              <button
                type="button"
                onClick={() => setRemoveSeason(row.season)}
                title={t('media.zurg_remove_season', 'Remove season {{n}} from Sonarr', { n: row.season })}
                aria-label={t('media.zurg_remove_season', 'Remove season {{n}} from Sonarr', { n: row.season })}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <ConfirmModal
        open={removeSeason !== null}
        tone="danger"
        title={t('media.zurg_remove_season_title', 'Remove this season from Sonarr?')}
        description={removeSeason !== null
          ? t('media.zurg_remove_season_desc', 'Season {{n}} is unmonitored and its downloaded files are deleted from Sonarr. Anything in Zurg is untouched.', { n: removeSeason })
          : undefined}
        confirmLabel={t('media.zurg_remove_season_confirm', 'Remove from Sonarr')}
        onConfirm={async () => {
          if (removeSeason === null) return;
          setRemoving(true);
          try {
            await api.post(`/media/${tmdbId}/remove-season`, { season: removeSeason });
            showToast(t('media.zurg_remove_season_done', 'Season {{n}} removed from Sonarr', { n: removeSeason }), 'success');
            await load(true);
          } catch (err) {
            toastApiError(err, t('media.zurg_remove_season_failed', 'Could not remove that season'));
          } finally {
            setRemoving(false);
            setRemoveSeason(null);
          }
        }}
        onClose={() => { if (!removing) setRemoveSeason(null); }}
      />

      {!readOnly && sonarrSeasons && toRequest.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onRequestSeasons(toRequest)}
            disabled={requesting}
            className="btn-primary !px-4 !py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            {t('media.zurg_request_missing', 'Add the missing seasons to Sonarr')}
          </button>
          <span className="text-xs text-ndp-text-dim">
            {t('media.zurg_request_missing_hint', 'Season(s) {{list}} — marked monitored in Sonarr, so your acquisition (zurg reads missing items from the *arrs) can fetch them.', { list: toRequest.join(', ') })}
          </span>
        </div>
      )}
    </section>
  );
}
