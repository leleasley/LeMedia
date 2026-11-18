import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { CheckSquare, ChevronDown, Copy, Film, Loader2, RefreshCw, Search, Trash2, Tv, X } from 'lucide-react';
import api from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';
import type { SwapCandidate } from './ZurgSwaps';
import { Spinner } from '@/components/Spinner';

export interface DupMember { hash: string; name: string; sizeBytes: number | null; added: string | null; quality: string | null; state: 'referenced' | 'no_reference' | 'unknown'; reasons: string[] }
export interface DupGroup { key: string; kind: string; title: string; members: DupMember[] }
export interface DupReport {
  swaps: SwapCandidate[];
  builtAt: string | null; refreshing: boolean; blockers: string[];
  refreshStartedAt?: string | null; typicalAnalysisMs?: number | null;
  groups: DupGroup[]; summary: { groups: number; deletable: number; reclaimableBytes: number };
}

/** "started 2 min ago, usually about 5 min" for a running analysis. */
export function useAnalysisNote(dups: DupReport | null): string | null {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dups?.refreshing) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [dups?.refreshing]);
  if (!dups?.refreshing) return null;
  const started = dups.refreshStartedAt ? Date.parse(dups.refreshStartedAt) : NaN;
  const mins = Number.isNaN(started) ? null : Math.max(0, Math.floor((now - started) / 60_000));
  const typical = dups.typicalAnalysisMs ? Math.max(1, Math.round(dups.typicalAnalysisMs / 60_000)) : null;
  const parts = [
    mins === null ? null : mins < 1 ? t('admin.zurg.dup.started_now', 'started just now') : t('admin.zurg.dup.started_ago', 'started {{n}} min ago', { n: mins }),
    typical ? t('admin.zurg.dup.usually', 'usually takes about {{n}} min', { n: typical }) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export const gb = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(2)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const STATE_CHIP: Record<DupMember['state'], { cls: string; key: string; fallback: string }> = {
  referenced: { cls: 'bg-emerald-500/15 text-emerald-300', key: 'admin.zurg.dup.in_use', fallback: 'In use' },
  no_reference: { cls: 'bg-amber-500/15 text-amber-300', key: 'admin.zurg.dup.no_reference', fallback: 'Not used' },
  unknown: { cls: 'bg-white/[0.07] text-ndp-text-muted', key: 'admin.zurg.dup.unknown', fallback: 'Unknown' },
};

type Filter = 'actionable' | 'movies' | 'tv' | 'all';
type Sort = 'space' | 'title' | 'copies';
const PAGE = 40;

const unusedBytes = (g: DupGroup) => g.members.filter((m) => m.state === 'no_reference').reduce((n, m) => n + (m.sizeBytes ?? 0), 0);

/** Duplicate releases: find, sort and select the unused copies; removing re-checks each one
 *  against Radarr/Sonarr first and sends it to zurg's 30-day trash. */
export function ZurgDuplicates({ dups, onReload }: Readonly<{ dups: DupReport | null; onReload: (fresh?: boolean) => Promise<void> }>) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('actionable');
  const [sort, setSort] = useState<Sort>('space');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | 'refresh' | 'delete'>(null);
  const [confirm, setConfirm] = useState(false);
  const analysisNote = useAnalysisNote(dups);

  // A season pack is listed under every season it covers; sizes and selections count it once.
  const byHash = useMemo(() => new Map((dups?.groups ?? []).flatMap((g) => g.members).map((m) => [m.hash, m])), [dups]);
  const groupsOf = useMemo(() => {
    const n = new Map<string, number>();
    for (const g of dups?.groups ?? []) for (const m of g.members) n.set(m.hash, (n.get(m.hash) ?? 0) + 1);
    return n;
  }, [dups]);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = (dups?.groups ?? []).filter((g) => {
      if (filter === 'actionable' && !g.members.some((m) => m.state === 'no_reference')) return false;
      if (filter === 'movies' && g.kind !== 'movie') return false;
      if (filter === 'tv' && g.kind !== 'season') return false;
      return !q || g.title.toLowerCase().includes(q) || g.members.some((m) => m.name.toLowerCase().includes(q));
    });
    // A shared pack's size is split across the groups it appears in, so one series pack
    // doesn't sort to the top of every season.
    const share = (g: DupGroup) => g.members.filter((m) => m.state === 'no_reference').reduce((n, m) => n + (m.sizeBytes ?? 0) / (groupsOf.get(m.hash) ?? 1), 0);
    list = [...list].sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title)
      : sort === 'copies' ? b.members.length - a.members.length
        : share(b) - share(a)));
    return list;
  }, [dups, query, filter, sort, groupsOf]);

  const selectedBytes = [...selected].reduce((n, h) => n + (byHash.get(h)?.sizeBytes ?? 0), 0);
  const visibleUnused = [...new Map(groups.flatMap((g) => g.members).filter((m) => m.state === 'no_reference').map((m) => [m.hash, m])).values()];

  const toggle = (set: Set<string>, key: string) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; };

  const refresh = async () => {
    setBusy('refresh');
    try {
      await api.post('/admin/zurg/duplicates/refresh');
      showToast(t('admin.zurg.dup.refreshing', 'Zurg is re-reading Radarr and Sonarr, this can take a minute'), 'info');
      window.setTimeout(() => void onReload(true), 4000);
    } catch (err) { toastApiError(err, t('admin.zurg.dup.refresh_failed', 'Could not start the analysis')); }
    finally { setBusy(null); }
  };

  const removeSelected = async () => {
    setBusy('delete');
    try {
      const { data } = await api.post<{ deleted: number; skipped: { name: string; state: string }[] }>('/admin/zurg/duplicates/delete', { hashes: [...selected] }, { timeout: 180_000 });
      showToast(data.skipped.length
        ? t('admin.zurg.dup.deleted_some', 'Moved {{n}} to Zurg\'s trash, {{k}} kept because they\'re now in use or unknown', { n: data.deleted, k: data.skipped.length })
        : t('admin.zurg.dup.deleted', 'Moved {{n}} to Zurg\'s trash (restorable for 30 days)', { n: data.deleted }), 'success');
      setSelected(new Set());
      await onReload(true);
    } catch (err) { toastApiError(err, t('admin.zurg.dup.delete_failed', 'Delete failed')); }
    finally { setBusy(null); }
  };

  if (!dups) return <div className="flex justify-center py-12"><Spinner /></div>;

  const analysed = dups.builtAt ? new Date(dups.builtAt).toLocaleString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const chips: { id: Filter; label: string }[] = [
    { id: 'actionable', label: t('admin.zurg.dup.filter_actionable', 'Can be cleaned') },
    { id: 'movies', label: t('admin.zurg.dup.filter_movies', 'Movies') },
    { id: 'tv', label: t('admin.zurg.dup.filter_tv', 'TV') },
    { id: 'all', label: t('admin.zurg.dup.filter_all', 'All') },
  ];

  return (
    <div className="space-y-3">
      <div className="admin-group divide-y divide-white/[0.06]">
        <div className="admin-row flex-wrap">
          <span className="admin-icon-tile"><Copy className="w-4 h-4" /></span>
          <div className="flex-1 min-w-[12rem]">
            <p className="text-[15px] font-medium text-ndp-text">
              {t('admin.zurg.dup.summary', '{{g}} duplicate groups · {{n}} unused releases', { g: dups.summary.groups, n: dups.summary.deletable })}
            </p>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              {dups.refreshing
                ? [t('admin.zurg.dup.analysing_long', 'Zurg is re-reading Radarr and Sonarr…'), analysisNote].filter(Boolean).join(' ')
                : [dups.summary.deletable > 0 ? t('admin.zurg.dup.reclaim', 'Up to {{size}} could be freed on TorBox', { size: gb(dups.summary.reclaimableBytes) }) : t('admin.zurg.dup.nothing', 'Nothing safe to remove right now'),
                  analysed ? t('admin.zurg.dup.analysed', 'analysed {{when}}', { when: analysed }) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={!!busy || dups.refreshing} className="btn-secondary flex items-center gap-2 !px-3 !py-2 !text-sm">
            {busy === 'refresh' || dups.refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {dups.refreshing ? t('admin.zurg.dup.analysing', 'Analysing…') : t('admin.zurg.dup.refresh', 'Refresh analysis')}
          </button>
        </div>
        {dups.blockers.length > 0 && (
          <p className="admin-row text-xs text-amber-300/90 leading-relaxed">
            {t('admin.zurg.dup.blocked', 'Everything shows as Unknown until Zurg has read Radarr and Sonarr, run Refresh analysis.')}
          </p>
        )}
      </div>

      {/* While zurg re-reads Radarr/Sonarr the old list is stale, hold it back until the new one lands. */}
      {dups.refreshing ? (
        <div className="admin-group admin-row justify-center gap-3 py-10 text-sm text-ndp-text-dim">
          <Spinner size="sm" />
          <span className="text-center">
            {t('admin.zurg.dup.wait_for_analysis_v2', 'The list appears when the analysis is done.')}
            {analysisNote && <span className="block text-xs mt-1">{analysisNote.charAt(0).toUpperCase() + analysisNote.slice(1)}.</span>}
          </span>
        </div>
      ) : (<>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t('admin.zurg.dup.search', 'Search titles or releases')} className="input w-full !pl-9 !h-10" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear', 'Clear')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ndp-text-dim hover:text-ndp-text"><X className="w-4 h-4" /></button>}
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="input !h-10 !py-0 sm:w-52" aria-label={t('admin.zurg.dup.sort', 'Sort')}>
          <option value="space">{t('admin.zurg.dup.sort_space', 'Most space to free')}</option>
          <option value="copies">{t('admin.zurg.dup.sort_copies', 'Most copies')}</option>
          <option value="title">{t('admin.zurg.dup.sort_title', 'Title A–Z')}</option>
        </select>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 overflow-x-auto">
          {chips.map((c) => (
            <button key={c.id} type="button" onClick={() => { setFilter(c.id); setLimit(PAGE); }} className={clsx('h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap', filter === c.id ? 'bg-ndp-text text-ndp-bg' : 'bg-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>
              {c.label}
            </button>
          ))}
        </div>
        {visibleUnused.length > 0 && (
          <button type="button" onClick={() => setSelected(new Set(visibleUnused.map((m) => m.hash)))} className="h-8 px-3 rounded-full text-xs font-semibold text-ndp-text-muted hover:text-ndp-text bg-white/[0.04] flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" />
            {t('admin.zurg.dup.select_all_unused', 'Select all unused ({{n}})', { n: visibleUnused.length })}
          </button>
        )}
      </div>

      {/* Groups */}
      <div className="admin-group divide-y divide-white/[0.06]">
        {groups.length === 0 && <p className="admin-row text-sm text-ndp-text-dim">{query ? t('admin.zurg.dup.no_match', 'Nothing matches that search.') : t('admin.zurg.dup.none_actionable', 'No group has an unused release right now.')}</p>}
        {groups.slice(0, limit).map((g) => {
          const isOpen = open.has(g.key);
          const free = unusedBytes(g);
          const picked = g.members.filter((m) => selected.has(m.hash)).length;
          const shared = Math.max(0, ...g.members.filter((m) => m.state === 'no_reference').map((m) => (groupsOf.get(m.hash) ?? 1) - 1));
          return (
            <div key={g.key}>
              <button type="button" onClick={() => setOpen((s) => toggle(s, g.key))} className="admin-row w-full text-left hover:bg-white/[0.03]" aria-expanded={isOpen}>
                <span className="admin-icon-tile">{g.kind === 'season' ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium text-ndp-text truncate">{g.title}</span>
                  <span className="block text-xs text-ndp-text-dim">
                    {t('admin.zurg.dup.copies', '{{n}} copies', { n: g.members.length })}
                    {free > 0 && <span className="text-amber-300/90"> · {t('admin.zurg.dup.can_free', '{{size}} unused', { size: gb(free) })}</span>}
                    {shared > 0 && <span> · {t('admin.zurg.dup.shared_pack', 'pack shared with {{n}} other group(s)', { n: shared })}</span>}
                    {g.kind === 'name' ? ` · ${t('admin.zurg.dup.name_match', 'matched by name')}` : ''}
                  </span>
                </span>
                {picked > 0 && <span className="admin-chip bg-ndp-accent/15 text-ndp-accent">{picked}</span>}
                <ChevronDown className={clsx('w-4 h-4 text-ndp-text-dim transition-transform flex-shrink-0', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <ul className="bg-black/20 divide-y divide-white/[0.04]">
                  {g.members.map((m) => {
                    const chip = STATE_CHIP[m.state];
                    const canPick = m.state === 'no_reference';
                    return (
                      <li key={m.hash}>
                        <label className={clsx('flex items-start gap-3 px-4 py-2.5', canPick && 'cursor-pointer hover:bg-white/[0.02]')}>
                          <input type="checkbox" disabled={!canPick} checked={selected.has(m.hash)} onChange={() => setSelected((s) => toggle(s, m.hash))} aria-label={m.name} className="mt-1 w-5 h-5 accent-ndp-accent disabled:opacity-30 flex-shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-ndp-text break-all leading-snug">{m.name}</span>
                            <span className="block text-xs text-ndp-text-dim mt-0.5">{[m.quality, m.sizeBytes ? gb(m.sizeBytes) : null, m.added ? m.added.slice(0, 10) : null].filter(Boolean).join(' · ')}</span>
                            {(groupsOf.get(m.hash) ?? 1) > 1 && <span className="block text-[11px] text-ndp-text-dim mt-0.5">{t('admin.zurg.dup.also_in', 'Also listed under {{n}} other group(s), removing it removes it there too', { n: (groupsOf.get(m.hash) ?? 1) - 1 })}</span>}
                            {m.reasons[0] && m.state === 'referenced' && <span className="block text-[11px] text-ndp-text-dim mt-0.5 break-all">{m.reasons[0]}</span>}
                          </span>
                          <span className={clsx('admin-chip flex-shrink-0', chip.cls)}>{t(chip.key, chip.fallback)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        {groups.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="admin-row w-full justify-center text-sm font-medium text-ndp-accent hover:bg-white/[0.03]">
            {t('admin.zurg.dup.show_more', 'Show more ({{n}} left)', { n: groups.length - limit })}
          </button>
        )}
      </div>
      </>)}
      <p className="admin-hint">{t('admin.zurg.dup.hint', 'Only releases Radarr and Sonarr don\'t use can be selected. LeMedia asks Zurg to check them again before removing anything, and removed releases stay in Zurg\'s trash for 30 days.')}</p>

      {/* Pinned action bar while something is selected */}
      {selected.size > 0 && !dups.refreshing && (
        <div className="sticky bottom-3 z-20">
          <div className="flex items-center gap-3 rounded-2xl bg-ndp-surface/95 backdrop-blur ring-1 ring-white/10 shadow-2xl shadow-black/50 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ndp-text">{t('admin.zurg.dup.n_selected', '{{n}} selected', { n: selected.size })}</p>
              <p className="text-xs text-ndp-text-dim">{t('admin.zurg.dup.frees', 'Frees {{size}} on TorBox', { size: gb(selectedBytes) })}</p>
            </div>
            <button type="button" onClick={() => setSelected(new Set())} className="btn-secondary !px-3 !py-2 !text-sm">{t('admin.zurg.dup.clear_sel', 'Clear')}</button>
            <button type="button" onClick={() => setConfirm(true)} disabled={!!busy} className="btn-danger flex items-center gap-2 !px-3 !py-2 !text-sm">
              {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('admin.zurg.dup.remove', 'Remove')}
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        onConfirm={async () => { setConfirm(false); await removeSelected(); }}
        title={t('admin.zurg.dup.confirm_title', 'Remove {{n}} unused release(s)?', { n: selected.size })}
        description={t('admin.zurg.dup.confirm_desc_size', 'About {{size}}. Zurg checks each one again first and keeps anything now in use. Removed releases go to Zurg\'s trash for 30 days. The check takes 15–20 seconds.', { size: gb(selectedBytes) })}
        confirmLabel={t('admin.zurg.dup.confirm_cta', 'Check and remove')}
      />
    </div>
  );
}
