import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { ArrowRightLeft, Copy, Trash2, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { AdminTabLayout } from './AdminTabLayout';
import { ZurgSwaps } from './zurg/ZurgSwaps';
import { ZurgDuplicates, gb, useAnalysisNote, type DupReport } from './zurg/ZurgDuplicates';
import { ZurgBroken } from './zurg/ZurgBroken';
import { ZurgTrash } from './zurg/ZurgTrash';
import { Spinner } from '@/components/Spinner';

type View = 'swaps' | 'duplicates' | 'broken' | 'trash';
const VIEWS: View[] = ['swaps', 'duplicates', 'broken', 'trash'];

interface Summary {
  swaps: { ready: number; blocked: number; savingsBytes: number };
  duplicates: { groups: number; unused: number; reclaimableBytes: number; refreshing: boolean } | null;
  broken: { count: number } | null;
  trash: { count: number } | null;
  swapJobs: { active: number };
  repairJobs: { active: number };
}

/** Admin → Media → Zurg Cleanup: everything that tidies the zurg / TorBox library, in one place —
 *  swap oversized files, remove unused duplicates, repair broken releases, manage the trash. */
export function CleanupTab() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dups, setDups] = useState<DupReport | null>(null);

  const viewParam = params.get('view') as View | null;
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : (summary && summary.swaps.ready === 0 ? 'duplicates' : 'swaps');
  const setView = (v: View) => setParams((p) => { const n = new URLSearchParams(p); n.set('view', v); return n; }, { replace: true });

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get<Summary>('/admin/zurg/cleanup/summary');
      // Only take a well-formed summary; anything else keeps the last good one.
      if (data && typeof data === 'object' && data.swaps && data.swapJobs && data.repairJobs) setSummary(data);
    } catch { /* keep last */ }
  }, []);

  const dupErrorShown = useRef(false);
  const loadDups = useCallback(async (fresh = false) => {
    try {
      const { data } = await api.get<DupReport>(`/admin/zurg/duplicates${fresh ? '?fresh=1' : ''}`);
      if (data && typeof data === 'object' && Array.isArray(data.groups) && Array.isArray(data.swaps)) setDups(data);
    }
    catch (err) {
      // One message per failure streak; the page keeps retrying quietly after that.
      if (!dupErrorShown.current) toastApiError(err, t('admin.zurg.dup.load_failed', 'Could not load duplicates'));
      dupErrorShown.current = true;
      return;
    }
    dupErrorShown.current = false;
    if (fresh) void loadSummary();
  }, [t, loadSummary]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { if ((view === 'swaps' || view === 'duplicates') && !dups) void loadDups(); }, [view, dups, loadDups]);

  // Keep the counts fresh: quickly while something runs in the background, slowly otherwise.
  const busyJobs = (summary?.swapJobs.active ?? 0) + (summary?.repairJobs.active ?? 0);
  useEffect(() => {
    // No summary yet (e.g. the page opened mid-restart): keep trying every 5 s until one arrives.
    const id = window.setInterval(() => void loadSummary(), !summary ? 5000 : busyJobs > 0 ? 6000 : 30_000);
    return () => window.clearInterval(id);
  }, [busyJobs, loadSummary, summary]);

  // Same for the duplicate list: if it didn't load, retry rather than leave the tab empty.
  useEffect(() => {
    if (dups || (view !== 'swaps' && view !== 'duplicates')) return;
    const id = window.setInterval(() => void loadDups(), 5000);
    return () => window.clearInterval(id);
  }, [dups, view, loadDups]);

  // While zurg re-reads Radarr/Sonarr, check back until it's done.
  useEffect(() => {
    if (!dups?.refreshing) return;
    const id = window.setTimeout(() => void loadDups(true), 8000);
    return () => window.clearTimeout(id);
  }, [dups, loadDups]);

  const analysing = !!(dups?.refreshing || summary?.duplicates?.refreshing);
  const analysisNote = useAnalysisNote(dups);
  const tiles: { view: View; icon: LucideIcon; tone: string; value: string; label: string; sub: string }[] = [
    { view: 'swaps', icon: ArrowRightLeft, tone: 'bg-sky-500/15 text-sky-300', value: !summary || analysing ? '…' : String(summary.swaps.ready), label: t('admin.cleanup.tile_swaps', 'Ready to swap'), sub: analysing ? t('admin.cleanup.analysing_short', 'analysing…') : summary?.swaps.ready ? t('admin.cleanup.saves', 'saves {{size}}', { size: gb(summary.swaps.savingsBytes) }) : t('admin.cleanup.none_ready', 'nothing waiting') },
    { view: 'duplicates', icon: Copy, tone: 'bg-amber-500/15 text-amber-300', value: !summary?.duplicates || analysing ? '…' : String(summary.duplicates.unused), label: t('admin.cleanup.tile_unused', 'Unused copies'), sub: analysing ? t('admin.cleanup.analysing_short', 'analysing…') : summary?.duplicates?.unused ? t('admin.cleanup.reclaim', '{{size}} to free', { size: gb(summary.duplicates.reclaimableBytes) }) : t('admin.cleanup.all_used', 'all copies in use') },
    { view: 'broken', icon: Wrench, tone: 'bg-red-500/15 text-red-300', value: summary?.broken ? String(summary.broken.count) : '-', label: t('admin.cleanup.tile_broken', 'Broken'), sub: summary?.repairJobs.active ? t('admin.cleanup.repairing_n', '{{n}} repairing', { n: summary.repairJobs.active }) : t('admin.cleanup.repair_hint', 'repair from TorBox') },
    { view: 'trash', icon: Trash2, tone: 'bg-white/[0.08] text-ndp-text-muted', value: summary?.trash ? String(summary.trash.count) : '-', label: t('admin.cleanup.tile_trash', 'In trash'), sub: t('admin.cleanup.trash_hint', 'kept 30 days') },
  ];

  const tabCount = (v: View): number | null => {
    if (!summary) return null;
    if (analysing && (v === 'swaps' || v === 'duplicates')) return null;
    if (v === 'swaps') return summary.swaps.ready;
    if (v === 'duplicates') return summary.duplicates?.unused ?? null;
    if (v === 'broken') return summary.broken?.count ?? null;
    return summary.trash?.count ?? null;
  };
  const tabLabel: Record<View, string> = {
    swaps: t('admin.cleanup.tab_swaps', 'Swaps'),
    duplicates: t('admin.cleanup.tab_duplicates', 'Duplicates'),
    broken: t('admin.cleanup.tab_broken', 'Broken'),
    trash: t('admin.cleanup.tab_trash', 'Trash'),
  };

  return (
    <AdminTabLayout>
      <div className="space-y-5">
        {/* What can be done, at a glance, each tile opens its tab. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const active = view === tile.view;
            return (
              <button
                key={tile.view}
                type="button"
                onClick={() => setView(tile.view)}
                className={clsx('text-left rounded-xl bg-ndp-surface ring-1 ring-inset px-4 py-3 transition-colors',
                  active ? 'ring-ndp-accent/50 bg-ndp-accent/[0.06]' : 'ring-white/[0.06] hover:bg-white/[0.03]')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ndp-text-dim truncate">{tile.label}</span>
                  <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', tile.tone)}><Icon className="w-3.5 h-3.5" /></span>
                </div>
                <p className="font-display text-3xl leading-none text-ndp-text mt-1.5 tabular-nums">{tile.value}</p>
                <p className="text-xs text-ndp-text-dim mt-1 truncate">{tile.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Background work in progress */}
        {busyJobs > 0 && summary && (
          <div className="flex items-center gap-3 rounded-xl bg-ndp-accent/10 ring-1 ring-inset ring-ndp-accent/25 px-4 py-2.5">
            <Spinner size="sm" />
            <p className="flex-1 min-w-0 text-sm text-ndp-text">
              {[summary.swapJobs.active ? t('admin.cleanup.swaps_running', '{{n}} swap(s) in the queue', { n: summary.swapJobs.active }) : null,
                summary.repairJobs.active ? t('admin.cleanup.repairs_running', '{{n}} repair(s) in the queue', { n: summary.repairJobs.active }) : null].filter(Boolean).join(' · ')}
              <span className="text-ndp-text-dim">, {t('admin.cleanup.background', 'running in the background, you can leave this page')}</span>
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-4 sm:flex sm:gap-1 border-b border-white/[0.06]" role="tablist">
          {VIEWS.map((v) => {
            const count = tabCount(v);
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={clsx('relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1 sm:px-3.5 h-14 sm:h-11 text-[13px] sm:text-sm font-medium whitespace-nowrap transition-colors',
                  view === v ? 'text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text')}
              >
                {tabLabel[v]}
                {count !== null && count > 0 && (
                  <span className={clsx('min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center tabular-nums',
                    view === v ? 'bg-ndp-accent text-white' : 'bg-white/[0.08] text-ndp-text-muted')}>{count}</span>
                )}
                {view === v && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-ndp-accent" aria-hidden />}
              </button>
            );
          })}
        </div>

        <div role="tabpanel">
          {view === 'swaps' && (dups && !dups.refreshing
            ? <ZurgSwaps swaps={dups.swaps} onSwapped={() => void loadDups(true)} />
            : (
              <div className="admin-group admin-row justify-center gap-3 py-10 text-sm text-ndp-text-dim">
                <Spinner size="sm" />
                <span className="text-center">
                  {dups?.refreshing ? t('admin.cleanup.analysing', 'Zurg is re-reading Radarr and Sonarr, swaps appear when it\'s done.') : t('common.loading', 'Loading…')}
                  {analysisNote && <span className="block text-xs mt-1">{analysisNote.charAt(0).toUpperCase() + analysisNote.slice(1)}.</span>}
                </span>
              </div>
            ))}
          {view === 'swaps' && dups && !dups.refreshing && dups.swaps.length === 0 && (
            <p className="admin-group admin-row text-sm text-ndp-text-dim">{t('admin.cleanup.no_swaps', 'No movie is using a 20 GB+ file while a smaller copy sits unused. Nothing to swap.')}</p>
          )}
          {view === 'duplicates' && <ZurgDuplicates dups={dups} onReload={loadDups} />}
          {view === 'broken' && <ZurgBroken />}
          {view === 'trash' && <ZurgTrash onChanged={() => void loadSummary()} />}
        </div>
      </div>
    </AdminTabLayout>
  );
}
