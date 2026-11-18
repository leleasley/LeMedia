import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Ban, Search, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';
import { APP_META, type LibApp } from './shared';
import { Spinner } from '@/components/Spinner';

interface Exclusion {
  id: number;
  app: LibApp;
  title: string;
  year: number | null;
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;
}

const APPS: LibApp[] = ['sonarr', 'radarr'];

/** Search folds accents so "pokemon" finds "Pokémon". */
const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const PAGE_SIZE = 100;

/** Admin → Radarr & Sonarr → Exclusions: the services' "never add this again" lists.
 *  Reading them here is how an admin finds out why a request would not add; removing one lets
 *  that title be added normally (an approved request does the same thing automatically). */
export function ArrExclusions() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Exclusion[] | null>(null);
  const [offline, setOffline] = useState<LibApp[]>([]);
  const [filter, setFilter] = useState<LibApp | 'all'>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [target, setTarget] = useState<Exclusion | null>(null);

  const load = useCallback(async () => {
    const rows: Exclusion[] = [];
    const down: LibApp[] = [];
    await Promise.all(APPS.map(async (app) => {
      try {
        const { data } = await api.get<Exclusion[]>(`/admin/arr/${app}/exclusions`);
        rows.push(...data);
      } catch {
        down.push(app);
      }
    }));
    setItems(rows);
    setOffline(down);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setLimit(PAGE_SIZE); }, [filter, query]);

  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    return (items ?? []).filter((e) =>
      (filter === 'all' || e.app === filter)
      && (!needle || fold(e.title).includes(needle) || String(e.year ?? '').includes(needle)),
    );
  }, [items, filter, query]);

  const counts = useMemo(() => ({
    all: items?.length ?? 0,
    sonarr: items?.filter((e) => e.app === 'sonarr').length ?? 0,
    radarr: items?.filter((e) => e.app === 'radarr').length ?? 0,
  }), [items]);

  const remove = async () => {
    if (!target) return;
    try {
      await api.delete(`/admin/arr/${target.app}/exclusions/${target.id}`);
      setItems((prev) => prev?.filter((e) => !(e.app === target.app && e.id === target.id)) ?? null);
      showToast(t('admin.arr.exclusions.removed', 'Exclusion removed — the title can be added now'), 'success');
    } catch (err) {
      toastApiError(err, t('admin.arr.exclusions.remove_failed', 'Could not remove that exclusion'));
    }
  };

  return (
    <div className="space-y-4">
      <p className="admin-hint">
        {t('admin.arr.exclusions.hint', 'These are the services\' "never add this again" lists. A request for one of these titles is held for approval; approving it removes the entry and adds the title. Removing it here has the same effect for any future request.')}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {(['all', ...APPS] as const).map((a) => (
            <button key={a} type="button" onClick={() => setFilter(a)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm ring-1 ring-inset transition-colors',
                filter === a ? 'bg-ndp-accent/15 ring-ndp-accent/40 text-ndp-text' : 'bg-ndp-surface ring-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>
              {a === 'all' ? t('common.all', 'All') : APP_META[a].name}
              <span className="text-ndp-text-dim ml-1.5 tabular-nums">{a === 'all' ? counts.all : counts[a]}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[12rem] max-w-sm ml-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ndp-text-dim pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.arr.exclusions.search', 'Search excluded titles…')}
            aria-label={t('admin.arr.exclusions.search', 'Search excluded titles…')}
            className="input w-full text-sm pl-9 pr-3 py-2"
          />
        </div>
      </div>

      {offline.length > 0 && (
        <p className="text-sm text-amber-300">
          {t('admin.arr.exclusions.offline', 'Could not read {{apps}} right now.', {
            apps: offline.map((a) => APP_META[a].name).join(' & '),
          })}
        </p>
      )}

      <div className="admin-group divide-y divide-white/[0.06]">
        {items === null && (
          <div className="admin-row text-sm text-ndp-text-dim"><Spinner size="sm" />{t('admin.arr.exclusions.loading', 'Reading the exclusion lists…')}</div>
        )}
        {items && filtered.length === 0 && (
          <div className="admin-row text-sm text-ndp-text-dim">
            <Ban className="w-4 h-4" />
            {items.length === 0
              ? t('admin.arr.exclusions.empty', 'Nothing is excluded.')
              : t('admin.arr.exclusions.no_match', 'No excluded title matches that search.')}
          </div>
        )}
        {filtered.slice(0, limit).map((e) => (
          <div key={`${e.app}-${e.id}`} className="admin-row">
            <span className={clsx('admin-chip flex-shrink-0', APP_META[e.app].tone)}>{APP_META[e.app].name}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ndp-text truncate">
                {e.title}{e.year ? <span className="text-ndp-text-dim font-normal"> ({e.year})</span> : null}
              </p>
              <p className="text-[11px] text-ndp-text-dim font-mono mt-0.5 truncate">
                {[e.tmdbId ? `tmdb ${e.tmdbId}` : null, e.tvdbId ? `tvdb ${e.tvdbId}` : null, e.imdbId].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTarget(e)}
              aria-label={t('admin.arr.exclusions.remove', 'Remove exclusion')}
              title={t('admin.arr.exclusions.remove', 'Remove exclusion')}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {filtered.length > limit && (
        <div className="flex justify-center">
          <button type="button" className="btn-secondary text-sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            {t('admin.arr.exclusions.show_more', 'Show more ({{shown}} of {{total}})', { shown: limit, total: filtered.length })}
          </button>
        </div>
      )}

      <ConfirmModal
        open={target !== null}
        tone="danger"
        title={t('admin.arr.exclusions.remove_title', 'Remove this exclusion?')}
        description={target
          ? t('admin.arr.exclusions.remove_desc', '"{{title}}" will no longer be blocked from being added to {{app}}.', { title: target.title, app: APP_META[target.app].name })
          : undefined}
        confirmLabel={t('admin.arr.exclusions.remove', 'Remove exclusion')}
        onConfirm={() => void remove()}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
