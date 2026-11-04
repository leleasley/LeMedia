import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, ChevronDown, Clock, ListPlus, Loader2, Wrench, X, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';
import { queueRepairs, repairActive, useRepairJobs } from './ZurgBroken';

export interface SwapMember { hash: string; name: string; sizeBytes: number | null; quality: string | null }
export interface SwapCandidate { key: string; tmdbId: number; title: string; current: SwapMember; smaller: SwapMember[]; blocked?: null | 'broken' | 'not_placed' }

interface SwapJob {
  id: string; key: string; tmdbId: number; title: string; keepSize: number; currentSize: number;
  state: 'queued' | 'running' | 'done' | 'failed'; step: string | null; message: string | null;
  result: { freedBytes: number; bigRelease: string } | null; queuedAt: string; finishedAt: string | null;
}

const gb = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(2)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const isActive = (j: SwapJob) => j.state === 'queued' || j.state === 'running';

/** "Big files with a smaller copy": Swap queues a background job on the server (one runs at a
 *  time), so several can be queued and they keep running after leaving the page. */
export function ZurgSwaps({ swaps: allSwaps, onSwapped }: Readonly<{ swaps: SwapCandidate[]; onSwapped: () => void }>) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<SwapJob[]>([]);
  const [confirm, setConfirm] = useState<null | { all: boolean; swap?: SwapCandidate }>(null);
  const [queueing, setQueueing] = useState(false);
  const seen = useRef<Map<string, SwapJob['state']>>(new Map());
  // A broken smaller copy can be repaired from here; once fixed it becomes swappable.
  const repairs = useRepairJobs((done) => {
    const fixed = done.filter((j) => j.state === 'fixed');
    if (fixed.length) showToast(t('admin.zurg.swap.repaired', '{{n}} copy repaired, it can be swapped now', { n: fixed.length }), 'success');
    const failed = done.filter((j) => j.state !== 'fixed');
    if (failed.length) showToast(`${failed[0].name}: ${failed[0].message ?? ''}`, 'error');
    onSwapped();
  });
  const repairFor = (hash: string) => [...repairs.jobs].reverse().find((j) => j.hash === hash);
  const repairCopy = async (hash: string) => {
    try { await queueRepairs([hash], 'keep'); showToast(t('admin.zurg.broken.queued_one', 'Repair queued, it runs in the background'), 'info'); await repairs.reload(); }
    catch (err) { toastApiError(err, t('admin.zurg.broken.queue_failed', 'Could not queue the repair')); }
  };

  const loadJobs = useCallback(async () => {
    try {
      const { data } = await api.get<{ jobs: SwapJob[] }>('/admin/zurg/swaps');
      // Toast the jobs that finished since the last look (not the ones already done on arrival).
      let finished = false;
      for (const j of data.jobs) {
        const before = seen.current.get(j.id);
        if (before && isActive({ state: before } as SwapJob) && !isActive(j)) {
          finished = true;
          if (j.state === 'done') showToast(t('admin.zurg.swap.done_bg', '{{title}} swapped, {{size}} freed on TorBox', { title: j.title, size: gb(j.result?.freedBytes ?? 0) }), 'success');
          else showToast(`${j.title}: ${j.message ?? t('admin.zurg.swap.failed', 'The swap didn\'t work')}`, 'error');
        }
        seen.current.set(j.id, j.state);
      }
      setJobs(data.jobs);
      if (finished) onSwapped();
    } catch { /* keep the last list */ }
  }, [t, onSwapped]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  // Poll while anything is queued or running.
  const anyActive = jobs.some(isActive);
  useEffect(() => {
    if (!anyActive) return;
    const id = window.setInterval(() => void loadJobs(), 3000);
    return () => window.clearInterval(id);
  }, [anyActive, loadJobs]);

  const latestByKey = useMemo(() => {
    const m = new Map<string, SwapJob>();
    for (const j of jobs) m.set(j.key, j);
    return m;
  }, [jobs]);

  // A finished swap stays in zurg's (cached) report until its next refresh — hide it here.
  const visible = allSwaps.filter((c) => latestByKey.get(c.key)?.state !== 'done');
  const swaps = visible.filter((c) => !c.blocked);
  const blocked = visible.filter((c) => c.blocked);
  const notQueued = swaps.filter((c) => { const j = latestByKey.get(c.key); return !j || !isActive(j); });

  const enqueue = async (list: SwapCandidate[]) => {
    setQueueing(true);
    try {
      for (const c of list) {
        const keep = c.smaller[0];
        const { data } = await api.post<{ job: SwapJob }>('/admin/zurg/duplicates/swap', {
          tmdbId: c.tmdbId, dropHash: c.current.hash, keepHash: keep.hash, keepSize: keep.sizeBytes,
          currentSize: c.current.sizeBytes ?? 0, title: c.title,
        });
        seen.current.set(data.job.id, data.job.state);
      }
      showToast(list.length === 1
        ? t('admin.zurg.swap.queued_one', '{{title}} queued, it runs in the background, you can leave this page', { title: list[0].title })
        : t('admin.zurg.swap.queued_many', '{{n}} swaps queued, they run one after another in the background', { n: list.length }), 'info');
      await loadJobs();
    } catch (err) {
      toastApiError(err, t('admin.zurg.swap.queue_failed', 'Could not queue the swap'));
    } finally { setQueueing(false); }
  };

  const cancel = async (id: string) => {
    try { await api.delete(`/admin/zurg/swaps/${id}`); await loadJobs(); }
    catch (err) { toastApiError(err, t('admin.zurg.swap.cancel_failed', 'It already started')); }
  };

  const clearFinished = async () => {
    try { await api.post('/admin/zurg/swaps/clear'); await loadJobs(); } catch { /* ignore */ }
  };

  const queueTotal = notQueued.reduce((n, c) => n + Math.max(0, (c.current.sizeBytes ?? 0) - (c.smaller[0].sizeBytes ?? 0)), 0);
  const recent = [...jobs].reverse().slice(0, 12);

  const statusOf = (j: SwapJob | undefined) => {
    if (!j) return null;
    if (j.state === 'queued') return <span className="admin-chip"><Clock className="w-3 h-3" />{t('admin.zurg.swap.state_queued', 'Queued')}</span>;
    if (j.state === 'running') return <span className="admin-chip bg-ndp-accent/15 text-ndp-accent"><Loader2 className="w-3 h-3 animate-spin" />{j.step ?? t('admin.zurg.swap.working', 'Swapping…')}</span>;
    if (j.state === 'failed') return <span className="admin-chip bg-red-500/15 text-red-300">{t('admin.zurg.swap.state_failed', 'Failed')}</span>;
    return null;
  };

  if (visible.length === 0 && jobs.length === 0) return null;

  return (
    <>
      {recent.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 mt-5 mb-2">
            <h4 className="admin-group-label !mb-0">{t('admin.zurg.swap.queue', 'Swap queue')}</h4>
            {jobs.some((j) => !isActive(j)) && (
              <button type="button" onClick={() => void clearFinished()} className="text-xs text-ndp-text-dim hover:text-ndp-text px-2 py-1">{t('admin.zurg.swap.clear', 'Clear finished')}</button>
            )}
          </div>
          <div className="admin-group divide-y divide-white/[0.06]">
            {recent.map((j) => (
              <div key={j.id} className="admin-row">
                <span className={clsx('admin-icon-tile',
                  j.state === 'done' && 'bg-emerald-500/15 text-emerald-400',
                  j.state === 'failed' && 'bg-red-500/15 text-red-400',
                  j.state === 'running' && 'bg-ndp-accent/15 text-ndp-accent')}>
                  {j.state === 'done' ? <CheckCircle2 className="w-4 h-4" /> : j.state === 'failed' ? <XCircle className="w-4 h-4" /> : j.state === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-ndp-text truncate">{j.title}</p>
                  <p className={clsx('text-xs mt-0.5', j.state === 'failed' ? 'text-red-300/90' : 'text-ndp-text-dim')}>
                    {j.state === 'queued' && t('admin.zurg.swap.waiting', 'Waiting · {{a}} → {{b}}', { a: gb(j.currentSize), b: gb(j.keepSize) })}
                    {j.state === 'running' && (j.step ?? t('admin.zurg.swap.working', 'Swapping…'))}
                    {j.state === 'done' && t('admin.zurg.swap.freed', 'Swapped · {{size}} freed', { size: gb(j.result?.freedBytes ?? 0) })}
                    {j.state === 'failed' && j.message}
                  </p>
                </div>
                {j.state === 'queued' && (
                  <button type="button" onClick={() => void cancel(j.id)} aria-label={t('common.cancel', 'Cancel')} className="w-9 h-9 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {swaps.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 mt-5 mb-2">
            <h4 className="admin-group-label !mb-0">{t('admin.zurg.swap.title', 'Big files with a smaller copy')}</h4>
            {notQueued.length > 1 && (
              <button type="button" onClick={() => setConfirm({ all: true })} disabled={queueing} className="btn-secondary flex items-center gap-2 !px-3 !py-1.5 !text-sm">
                {queueing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                {t('admin.zurg.swap.queue_all', 'Queue all ({{n}})', { n: notQueued.length })}
              </button>
            )}
          </div>
          <div className="admin-group divide-y divide-white/[0.06]">
            {swaps.map((c) => {
              const keep = c.smaller[0];
              const job = latestByKey.get(c.key);
              const active = !!job && isActive(job);
              return (
                <div key={c.key} className="admin-row flex-wrap">
                  <span className="admin-icon-tile"><ArrowRightLeft className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-[15px] font-medium text-ndp-text truncate">{c.title}</p>
                    <p className="text-xs text-ndp-text-dim mt-0.5">
                      <span className="text-amber-300/90">{t('admin.zurg.swap.in_use', 'In use')}: {gb(c.current.sizeBytes ?? 0)}{c.current.quality ? ` ${c.current.quality}` : ''}</span>
                      {' → '}
                      <span className="text-emerald-300/90">{t('admin.zurg.swap.available', 'available')}: {gb(keep.sizeBytes ?? 0)}{keep.quality ? ` ${keep.quality}` : ''}</span>
                    </p>
                    <p className="text-[11px] text-ndp-text-dim mt-0.5 break-all">{keep.name}</p>
                  </div>
                  {active ? statusOf(job) : (
                    <div className="flex items-center gap-2">
                      {statusOf(job)}
                      <button type="button" onClick={() => setConfirm({ all: false, swap: c })} disabled={queueing} className="btn-secondary flex items-center gap-2 !px-3 !py-2 !text-sm">
                        <ArrowRightLeft className="w-4 h-4" />
                        {job?.state === 'failed' ? t('admin.zurg.swap.retry', 'Retry') : t('admin.zurg.swap.cta', 'Swap')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="admin-hint">{t('admin.zurg.swap.hint_bg', 'Movies only. Swaps run in the background, one at a time, queue as many as you like and leave the page. Each one: Radarr deletes the big file (removing that release from TorBox), rescans, and picks up the smaller copy already in the movie folder. TV packs aren\'t swapped: their smaller copies usually cover fewer episodes.')}</p>
        </>
      )}

      {blocked.length > 0 && (
        <details className="mt-4 group/blocked">
          <summary className="admin-group-label cursor-pointer select-none list-none flex items-center gap-1.5 !mb-2">
            <ChevronDown className="w-3.5 h-3.5 -rotate-90 group-open/blocked:rotate-0 transition-transform" />
            {t('admin.zurg.swap.blocked_title', 'Can\'t be swapped ({{n}})', { n: blocked.length })}
          </summary>
          <div className="admin-group divide-y divide-white/[0.06]">
            {blocked.map((c) => (
              <div key={c.key} className="admin-row">
                <span className="admin-icon-tile bg-amber-500/10 text-amber-300/80"><AlertTriangle className="w-4 h-4" /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-ndp-text truncate">{c.title}</p>
                  <p className="text-xs text-ndp-text-dim mt-0.5">
                    {c.blocked === 'broken'
                      ? t('admin.zurg.swap.blocked_broken', 'The {{size}} copy is broken on TorBox (no files left), keeping the {{big}} file', { size: gb(c.smaller[0].sizeBytes ?? 0), big: gb(c.current.sizeBytes ?? 0) })
                      : t('admin.zurg.swap.blocked_not_placed', 'The {{size}} copy isn\'t in the movie folder, so Radarr can\'t pick it up', { size: gb(c.smaller[0].sizeBytes ?? 0) })}
                  </p>
                  <p className="text-[11px] text-ndp-text-dim mt-0.5 break-all">{c.smaller[0].name}</p>
                  {(() => { const r = repairFor(c.smaller[0].hash); return r?.state === 'failed' ? <p className="text-[11px] text-red-300/90 mt-0.5">{r.message}</p> : null; })()}
                </div>
                {c.blocked === 'broken' && (() => {
                  const r = repairFor(c.smaller[0].hash);
                  if (r && repairActive(r)) {
                    return <span className="admin-chip bg-ndp-accent/15 text-ndp-accent flex-shrink-0"><Loader2 className="w-3 h-3 animate-spin" />{r.state === 'running' ? (r.step ?? t('admin.zurg.broken.repairing', 'Repairing…')) : t('admin.zurg.broken.queued', 'Queued')}</span>;
                  }
                  return (
                    <button type="button" onClick={() => void repairCopy(c.smaller[0].hash)} className="btn-secondary flex items-center gap-1.5 !px-3 !py-1.5 !text-sm flex-shrink-0">
                      <Wrench className="w-3.5 h-3.5" />{t('admin.zurg.broken.repair', 'Repair')}
                    </button>
                  );
                })()}
              </div>
            ))}
          </div>
          <p className="admin-hint">{t('admin.zurg.swap.blocked_hint', 'Repair asks TorBox for the copy again, if it comes back, the movie moves up to the swap list. Repairs run in the background; the Broken tab shows them all.')}</p>
        </details>
      )}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        tone="danger"
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          await enqueue(c.all ? notQueued : c.swap ? [c.swap] : []);
        }}
        title={confirm?.all
          ? t('admin.zurg.swap.confirm_all_title', 'Queue {{n}} swaps?', { n: notQueued.length })
          : t('admin.zurg.swap.confirm_title', 'Swap {{title}} to the smaller copy?', { title: confirm?.swap?.title })}
        description={confirm?.all
          ? t('admin.zurg.swap.confirm_all_desc', 'Each movie switches to its smaller copy and the big release is removed from TorBox, about {{size}} in total. They run one after another in the background; queued ones can still be cancelled.', { size: gb(queueTotal) })
          : confirm?.swap
            ? t('admin.zurg.swap.confirm_desc', 'Radarr deletes the {{big}} file and switches to the {{small}} copy. The big release is removed from TorBox, this can\'t be undone from here.', { big: gb(confirm.swap.current.sizeBytes ?? 0), small: gb(confirm.swap.smaller[0].sizeBytes ?? 0) })
            : ''}
        confirmLabel={confirm?.all ? t('admin.zurg.swap.queue_all_cta', 'Queue all') : t('admin.zurg.swap.cta', 'Swap')}
      />
    </>
  );
}
