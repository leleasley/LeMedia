import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { CheckCircle2, Clock, Loader2, PauseCircle, PlayCircle, Trash2, Wrench, X, XCircle } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';

interface BrokenItem { hash: string; name: string; sizeBytes: number; brokenFiles: number; totalFiles: number; state: 'broken' | 'under_repair' | 'cannot_repair'; inUse: boolean | null }
export interface RepairJob {
  id: string; hash: string; name: string; sizeBytes: number;
  state: 'queued' | 'running' | 'fixed' | 'removed' | 'failed'; step: string | null; message: string | null;
}

const gb = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(2)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
export const repairActive = (j: { state: string }) => j.state === 'queued' || j.state === 'running';

/** Polls the server-side repair queue while anything in it is waiting or running, and calls
 *  `onFinished` with the jobs that finished since the last look. Shared with the swap list. */
export interface RepairControl { paused: boolean; reason: string | null; usedThisHour: number; hourlyBudget: number }

export function useRepairJobs(onFinished?: (done: RepairJob[]) => void) {
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [control, setControl] = useState<RepairControl | null>(null);
  const seen = useRef<Map<string, string>>(new Map());
  const cb = useRef(onFinished);
  cb.current = onFinished;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ jobs: RepairJob[]; control?: RepairControl }>('/admin/zurg/repairs');
      if (data.control) setControl(data.control);
      const done: RepairJob[] = [];
      for (const j of data.jobs) {
        const before = seen.current.get(j.id);
        if (before && repairActive({ state: before }) && !repairActive(j)) done.push(j);
        seen.current.set(j.id, j.state);
      }
      setJobs(data.jobs);
      if (done.length) cb.current?.(done);
    } catch { /* keep the last list */ }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const anyActive = jobs.some(repairActive);
  useEffect(() => {
    if (!anyActive) return;
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [anyActive, load]);

  return { jobs, control, reload: load };
}

export async function queueRepairs(hashes: string[], onFail: 'trash' | 'keep') {
  const { data } = await api.post<{ queued: number; skipped: number }>('/admin/zurg/broken/repair', { hashes, onFail });
  return data;
}

/** Zurg's broken releases (TorBox no longer serves them): repair one or all in the background;
 *  what can't be restored and nothing uses can go to zurg's trash. */
export function ZurgBroken() {
  const { t } = useTranslation();
  const [items, setItems] = useState<BrokenItem[] | null>(null);
  // Off by default: zurg's "can't repair" isn't always final, so nothing is binned unless asked.
  const [trashOnFail, setTrashOnFail] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const [inUsePending, setInUsePending] = useState(false);
  const loadItems = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: BrokenItem[]; inUsePending?: boolean }>('/admin/zurg/broken');
      setItems(data.items);
      setInUsePending(!!data.inUsePending);
    } catch (err) { toastApiError(err, t('admin.zurg.broken.load_failed', 'Could not load broken releases')); setItems([]); }
  }, [t]);

  // The list arrives at once; "In use" labels fill in when the background check (~15 s) is done.
  useEffect(() => {
    if (!inUsePending) return;
    const id = window.setTimeout(() => void loadItems(), 16_000);
    return () => window.clearTimeout(id);
  }, [inUsePending, loadItems]);

  const { jobs, control, reload } = useRepairJobs((done) => {
    const fixed = done.filter((j) => j.state === 'fixed').length;
    const removed = done.filter((j) => j.state === 'removed').length;
    const failed = done.filter((j) => j.state === 'failed').length;
    showToast([
      fixed ? t('admin.zurg.broken.n_fixed', '{{n}} repaired', { n: fixed }) : null,
      removed ? t('admin.zurg.broken.n_removed', '{{n}} moved to trash', { n: removed }) : null,
      failed ? t('admin.zurg.broken.n_failed', '{{n}} couldn\'t be repaired', { n: failed }) : null,
    ].filter(Boolean).join(' · '), failed && !fixed ? 'error' : 'success');
    void loadItems();
  });

  useEffect(() => { void loadItems(); }, [loadItems]);

  const jobFor = (hash: string) => [...jobs].reverse().find((j) => j.hash === hash);
  const idle = (items ?? []).filter((i) => { const j = jobFor(i.hash); return !j || !repairActive(j); });
  // What repair couldn't save: zurg marks it unrepairable, or our 3 tries all failed. Only copies
  // Radarr/Sonarr don't use can be removed (the server re-checks before deleting).
  const unrepairable = idle.filter((i) => i.inUse !== true && (i.state === 'cannot_repair' || jobFor(i.hash)?.state === 'failed'));
  const [removeAsk, setRemoveAsk] = useState<null | { hashes: string[]; label: string; bytes: number }>(null);
  const [removing, setRemoving] = useState(false);

  const remove = async (hashes: string[]) => {
    setRemoving(true);
    try {
      const { data } = await api.post<{ deleted: number; skipped: { name: string; state: string }[] }>('/admin/zurg/duplicates/delete', { hashes }, { timeout: 180_000 });
      showToast(data.skipped.length
        ? t('admin.zurg.broken.removed_some', 'Moved {{n}} to Zurg\'s trash, {{k}} kept because Radarr or Sonarr uses them (or Zurg couldn\'t tell)', { n: data.deleted, k: data.skipped.length })
        : t('admin.zurg.broken.removed', 'Moved {{n}} to Zurg\'s trash (restorable for 30 days)', { n: data.deleted }), data.skipped.length ? 'info' : 'success');
      await loadItems();
    } catch (err) { toastApiError(err, t('admin.zurg.dup.delete_failed', 'Delete failed')); }
    finally { setRemoving(false); }
  };

  const repair = async (hashes: string[]) => {
    setBusy(true);
    try {
      const r = await queueRepairs(hashes, trashOnFail ? 'trash' : 'keep');
      showToast(hashes.length === 1
        ? t('admin.zurg.broken.queued_one', 'Repair queued, it runs in the background')
        : t('admin.zurg.broken.queued_many', '{{n}} repairs queued, one at a time, about 30 s each', { n: r.queued }), 'info');
      await reload();
    } catch (err) { toastApiError(err, t('admin.zurg.broken.queue_failed', 'Could not queue the repair')); }
    finally { setBusy(false); }
  };

  const setPaused = async (pause: boolean) => {
    try { await api.post(`/admin/zurg/repairs/${pause ? 'pause' : 'resume'}`); await reload(); }
    catch (err) { toastApiError(err, t('common.error', 'Something went wrong')); }
  };

  const cancel = async (id: string) => {
    try { await api.delete(`/admin/zurg/repairs/${id}`); await reload(); } catch { /* already started */ }
  };

  const active = jobs.filter(repairActive);
  const finished = jobs.filter((j) => !repairActive(j));
  const recent = [...finished].reverse().slice(0, 15);

  return (
    <>
      {control?.paused && (
        <div className="mb-3 flex items-start gap-3 rounded-xl bg-amber-500/10 ring-1 ring-inset ring-amber-500/25 px-4 py-3">
          <PauseCircle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-200">{t('admin.zurg.broken.paused', 'Repairs are paused')}{active.length ? ` · ${t('admin.zurg.broken.n_waiting', '{{n}} waiting', { n: active.length })}` : ''}</p>
            {control.reason && <p className="text-xs text-amber-100/70 mt-0.5 leading-relaxed">{control.reason}</p>}
          </div>
          <button type="button" onClick={() => void setPaused(false)} className="btn-secondary flex items-center gap-1.5 !px-3 !py-1.5 !text-sm flex-shrink-0">
            <PlayCircle className="w-4 h-4" />{t('admin.zurg.broken.resume', 'Resume')}
          </button>
        </div>
      )}
      <div className="admin-group divide-y divide-white/[0.06]">
        <div className="admin-row flex-wrap">
          <span className="admin-icon-tile"><Wrench className="w-4 h-4" /></span>
          <div className="flex-1 min-w-[12rem]">
            <p className="text-[15px] font-medium text-ndp-text">
              {items === null ? t('common.loading', 'Loading…') : t('admin.zurg.broken.summary', '{{n}} broken releases', { n: items.length })}
            </p>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              {active.length > 0
                ? `${t('admin.zurg.broken.working', 'Repairing {{n}}, runs in the background', { n: active.length })}${control ? ` · ${t('admin.zurg.broken.budget', '{{u}} of {{b}} TorBox requests this hour', { u: control.usedThisHour, b: control.hourlyBudget })}` : ''}`
                : inUsePending
                  ? t('admin.zurg.broken.checking_use', 'Checking which ones Radarr and Sonarr use…')
                  : t('admin.zurg.broken.what', 'TorBox no longer serves these files. A repair re-adds them; most come back in under a minute.')}
            </p>
          </div>
          {active.length > 0 && !control?.paused && (
            <button type="button" onClick={() => void setPaused(true)} className="btn-secondary flex items-center gap-1.5 !px-3 !py-2 !text-sm">
              <PauseCircle className="w-4 h-4" />{t('admin.zurg.broken.pause', 'Pause')}
            </button>
          )}
          {unrepairable.length > 0 && (
            <button type="button" onClick={() => setRemoveAsk({ hashes: unrepairable.map((i) => i.hash), label: t('admin.zurg.broken.n_releases', '{{n}} releases', { n: unrepairable.length }), bytes: unrepairable.reduce((n, i) => n + i.sizeBytes, 0) })} disabled={removing} className="btn-danger flex items-center gap-2 !px-3 !py-2 !text-sm">
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('admin.zurg.broken.remove_unrepairable', 'Remove {{n}} that can\'t be repaired', { n: unrepairable.length })}
            </button>
          )}
          {idle.length > 0 && (
            <button type="button" onClick={() => setConfirmAll(true)} disabled={busy} className="btn-primary flex items-center gap-2 !px-3 !py-2 !text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              {t('admin.zurg.broken.repair_all', 'Repair all ({{n}})', { n: idle.length })}
            </button>
          )}
        </div>
        <div className="admin-row">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ndp-text">{t('admin.zurg.broken.trash_on_fail', 'After 3 failed tries, move it to the trash')}</p>
            <p className="text-xs text-ndp-text-dim mt-0.5">{t('admin.zurg.broken.trash_on_fail_hint', 'Only when Radarr and Sonarr don\'t use it. Restorable for 30 days. Off by default, Zurg\'s first "can\'t repair" is often wrong, so each one is retried 3 times.')}</p>
          </div>
          <Switch checked={trashOnFail} onChange={setTrashOnFail} label={t('admin.zurg.broken.trash_on_fail', 'If it can\'t be repaired, move it to the trash')} />
        </div>
      </div>

      {items && items.length > 0 && (
        <div className="admin-group divide-y divide-white/[0.06] mt-3">
          {items.slice(0, 150).map((i) => {
            const j = jobFor(i.hash);
            const running = j && repairActive(j);
            return (
              <div key={i.hash} className="admin-row items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ndp-text break-all leading-snug">{i.name}</p>
                  <p className="text-xs text-ndp-text-dim mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{gb(i.sizeBytes)}</span>
                    <span>· {t('admin.zurg.broken.files', '{{b}} of {{t}} files broken', { b: i.brokenFiles, t: i.totalFiles })}</span>
                    {i.state === 'cannot_repair' && <span className="admin-chip bg-red-500/15 text-red-300">{t('admin.zurg.broken.cannot', 'Can\'t repair')}</span>}
                    {i.inUse && <span className="admin-chip bg-amber-500/15 text-amber-300">{t('admin.zurg.broken.in_use', 'In use')}</span>}
                  </p>
                  {j?.state === 'failed' && <p className="text-[11px] text-red-300/90 mt-1">{j.message}</p>}
                </div>
                {running ? (
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="admin-chip bg-ndp-accent/15 text-ndp-accent">
                      {j.state === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                      {j.state === 'running' ? (j.step ?? t('admin.zurg.broken.repairing', 'Repairing…')) : t('admin.zurg.broken.queued', 'Queued')}
                    </span>
                    {j.state === 'queued' && (
                      <button type="button" onClick={() => void cancel(j.id)} aria-label={t('common.cancel', 'Cancel')} className="w-8 h-8 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => void repair([i.hash])} disabled={busy} className="btn-secondary flex items-center gap-1.5 !px-3 !py-1.5 !text-sm">
                      <Wrench className="w-3.5 h-3.5" />
                      {j?.state === 'failed' ? t('admin.zurg.swap.retry', 'Retry') : t('admin.zurg.broken.repair', 'Repair')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveAsk({ hashes: [i.hash], label: i.name, bytes: i.sizeBytes })}
                      disabled={removing || i.inUse === true}
                      aria-label={t('admin.zurg.broken.remove', 'Remove')}
                      title={i.inUse ? t('admin.zurg.broken.remove_in_use', 'Radarr or Sonarr uses this, removing it would break that title') : t('admin.zurg.broken.remove', 'Remove')}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ndp-text-muted"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {items && items.length === 0 && (
        <p className="admin-group admin-row text-sm text-ndp-text-dim mt-3">{t('admin.zurg.broken.none', 'Nothing broken, every release is being served.')}</p>
      )}

      {recent.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 mt-5 mb-2">
            <h4 className="admin-group-label !mb-0">{t('admin.zurg.broken.results', 'Recent repairs')}</h4>
            <button type="button" onClick={async () => { await api.post('/admin/zurg/repairs/clear').catch(() => {}); await reload(); }} className="text-xs text-ndp-text-dim hover:text-ndp-text px-2 py-1">{t('admin.zurg.swap.clear', 'Clear finished')}</button>
          </div>
          <div className="admin-group divide-y divide-white/[0.06]">
            {recent.map((j) => (
              <div key={j.id} className="admin-row">
                <span className={clsx('admin-icon-tile',
                  j.state === 'fixed' && 'bg-emerald-500/15 text-emerald-400',
                  j.state === 'removed' && 'bg-white/[0.06] text-ndp-text-muted',
                  j.state === 'failed' && 'bg-red-500/15 text-red-400')}>
                  {j.state === 'fixed' ? <CheckCircle2 className="w-4 h-4" /> : j.state === 'removed' ? <Trash2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ndp-text truncate">{j.name}</p>
                  <p className={clsx('text-xs mt-0.5', j.state === 'failed' ? 'text-red-300/90' : 'text-ndp-text-dim')}>
                    {j.state === 'fixed' ? t('admin.zurg.broken.fixed', 'Repaired, playable again') : j.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmModal
        open={!!removeAsk}
        onClose={() => setRemoveAsk(null)}
        tone="danger"
        onConfirm={async () => { const r = removeAsk; setRemoveAsk(null); if (r) await remove(r.hashes); }}
        title={removeAsk && removeAsk.hashes.length > 1
          ? t('admin.zurg.broken.remove_title_n', 'Remove {{n}} broken releases?', { n: removeAsk.hashes.length })
          : t('admin.zurg.broken.remove_title', 'Remove this broken release?')}
        description={removeAsk
          ? t('admin.zurg.broken.remove_desc', '{{what}} ({{size}}). Zurg checks each one against Radarr and Sonarr first and keeps anything in use. Removed releases go to Zurg\'s trash for 30 days and are deleted on TorBox. The check takes 15–20 seconds.', { what: removeAsk.label, size: gb(removeAsk.bytes) })
          : ''}
        confirmLabel={t('admin.zurg.dup.confirm_cta', 'Check and remove')}
      />

      <ConfirmModal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={async () => { setConfirmAll(false); await repair(idle.map((i) => i.hash)); }}
        title={t('admin.zurg.broken.confirm_title', 'Repair {{n}} releases?', { n: idle.length })}
        description={trashOnFail
          ? t('admin.zurg.broken.confirm_trash', 'They run one at a time in the background, at most 20 TorBox requests an hour and only when Zurg is idle, so a long list takes a few hours. Each gets up to 3 tries; any still broken after that and not used by Radarr or Sonarr go to Zurg\'s trash for 30 days.')
          : t('admin.zurg.broken.confirm_keep', 'They run one at a time in the background, at most 20 TorBox requests an hour and only when Zurg is idle, so a long list takes a few hours. Each gets up to 3 tries; any still broken after that are left as they are.')}
        confirmLabel={t('admin.zurg.broken.repair_all_cta', 'Repair all')}
      />
    </>
  );
}
