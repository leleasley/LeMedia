import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';

interface Job { id: string; status: 'running' | 'done' | 'failed'; phase: string; error?: string }
interface State { autoUpdate: boolean; lastAuto: { at: string; result: string } | null; helper: boolean; running: Job | null }

/** Update Zurg now (pull the nightly image and recreate it) and the overnight auto-update switch.
 *  Both go through the host helper set up under Radarr & Sonarr → Settings. */
export function ZurgUpdateRow({ onUpdated }: Readonly<{ onUpdated?: () => void }>) {
  const [st, setSt] = useState<State | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [ask, setAsk] = useState(false);
  const timer = useRef(0);

  const load = useCallback(async () => {
    try { const { data } = await api.get<State>('/admin/zurg/update'); setSt(data); if (data.running) setJob(data.running); } catch { /* keep */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const tick = async () => {
      try {
        const { data } = await api.get<Job>(`/admin/zurg/update/jobs/${job.id}`);
        setJob(data);
        if (data.status !== 'running') {
          showToast(data.status === 'done' ? data.phase : data.error ?? 'Zurg update failed', data.status === 'done' ? 'success' : 'error');
          onUpdated?.(); void load();
          return;
        }
      } catch { /* Zurg or LeMedia busy, keep polling */ }
      timer.current = window.setTimeout(tick, 4000);
    };
    timer.current = window.setTimeout(tick, 4000);
    return () => window.clearTimeout(timer.current);
  }, [job, load, onUpdated]);

  if (!st) return null;
  const running = job?.status === 'running';

  return (
    <>
      <div className="admin-row flex-wrap">
        <span className="admin-icon-tile"><Download className="w-4 h-4" /></span>
        <div className="flex-1 min-w-[12rem]">
          <p className="text-[15px] text-ndp-text">Update Zurg</p>
          <p className="text-xs text-ndp-text-dim mt-0.5">
            {!st.helper ? <>Needs the host helper, <Link to="/admin?tab=arr&view=settings" className="text-ndp-accent hover:underline">set it up</Link>.</>
              : running ? job!.phase
              : st.lastAuto ? `Last overnight check: ${st.lastAuto.result}` : 'Pulls the latest nightly image and restarts Zurg (the mount blips for a few seconds).'}
          </p>
        </div>
        <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5" disabled={!st.helper || running} onClick={() => setAsk(true)}>
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Update now
        </button>
      </div>
      <div className="admin-row">
        <div className="flex-1 min-w-0 pl-11">
          <p className="text-sm text-ndp-text">Update automatically overnight</p>
          <p className="text-xs text-ndp-text-dim">At 06:30, when GitHub shows a newer build than the one running.</p>
        </div>
        <Switch checked={st.autoUpdate} disabled={!st.helper} label="Update Zurg automatically overnight" className="-mr-1.5"
          onChange={async (on) => { try { const { data } = await api.put<State>('/admin/zurg/update', { autoUpdate: on }); setSt({ ...st, ...data }); } catch (err) { toastApiError(err, 'Could not save'); } }} />
      </div>
      <ConfirmModal open={ask} title="Update Zurg now?" confirmLabel="Update"
        description="LeMedia pulls the latest Zurg image and recreates the container. Anything playing from the library pauses for a few seconds while the mount comes back."
        onClose={() => setAsk(false)}
        onConfirm={async () => {
          try { const { data } = await api.post<{ jobId: string }>('/admin/zurg/update'); setJob({ id: data.jobId, status: 'running', phase: 'Pulling the latest Zurg image' }); }
          catch (err) { toastApiError(err, 'Could not start the update'); }
        }} />
    </>
  );
}
