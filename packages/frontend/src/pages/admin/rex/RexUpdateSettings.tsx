import { useCallback, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { ConfirmModal } from '@/components/ConfirmModal';
import { copyToClipboard } from '@/utils/clipboard';
import { showToast, toastApiError } from '@/utils/toast';
import { Spinner } from '@/components/Spinner';

type Job = { id: string; status: 'running' | 'done' | 'failed'; phase: string; error?: string };
type State = { autoUpdate: boolean; lastAuto: { at: string; result: string } | null; running: Job | null; helper: { host: string; port: number; user: string; hasKey: boolean; verifiedAt: string | null; hostname: string | null } };
export function RexUpdateSettings() {
  const [state, setState] = useState<State | null>(null);
  const [host, setHost] = useState(''); const [port, setPort] = useState(22); const [user, setUser] = useState('root');
  const [job, setJob] = useState<Job | null>(null);
  const [command, setCommand] = useState(''); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(false);
  const load = useCallback(async (populate = false) => { const { data } = await api.get<State>('/admin/rex/update'); setState(data); if (populate) { setHost(data.helper.host); setPort(data.helper.port); setUser(data.helper.user); } }, []);
  useEffect(() => { void load(true).catch(() => showToast('Could not load REX settings', 'error')); }, [load]);
  useEffect(() => { if (state?.running && !job) setJob(state.running); }, [state?.running, job]);
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = window.setInterval(() => { void api.get<Job>(`/admin/rex/update/jobs/${job.id}`).then(({ data }) => {
      setJob(data);
      if (data.status !== 'running') { showToast(data.status === 'done' ? data.phase : data.error || 'REX update failed', data.status === 'done' ? 'success' : 'error'); void load(); }
    }).catch(() => {}); }, 4000);
    return () => window.clearInterval(timer);
  }, [job, load]);
  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); await load(); } catch (err) { toastApiError(err, 'REX operation failed'); } finally { setBusy(false); } };
  const makeCommand = () => act(async () => {
    await api.put('/admin/rex/helper', { host, port, user });
    if (!state?.helper.hasKey) await api.post('/admin/rex/helper/key');
    const { data } = await api.post<{ token: string }>('/admin/rex/helper/install');
    setCommand(`curl -fsSL '${window.location.origin}/api/webhooks/rex-helper/install?t=${data.token}' | sudo sh`);
  });
  if (!state) return <div className="admin-row text-sm text-ndp-text-dim"><Spinner size="sm" /> Loading REX settings…</div>;
  const connected = !!state.helper.verifiedAt;
  return <div className="space-y-4">
    <div className="admin-row flex-wrap gap-2">
      <div className="flex-1 min-w-[12rem]"><p className="text-sm font-medium text-ndp-text">REX Docker host</p><p className="text-xs text-ndp-text-dim">{connected ? `Connected to ${state.helper.hostname || state.helper.host}` : 'Install the restricted helper on the server running REX.'}</p></div>
    </div>
    <div className="admin-row flex-wrap gap-2">
      <input className="input flex-1 min-w-[10rem]" aria-label="REX SSH host" placeholder="Host or IP address" value={host} onChange={e => setHost(e.target.value)} />
      <input className="input w-20" type="number" aria-label="SSH port" min={1} max={65535} value={port} onChange={e => setPort(Number(e.target.value))} />
      <input className="input w-28" aria-label="SSH user" value={user} onChange={e => setUser(e.target.value)} />
      <button type="button" className="btn-secondary text-sm" disabled={busy || !host} onClick={() => void makeCommand()}>Create setup command</button>
    </div>
    {command && <div className="admin-row flex-wrap gap-2"><p className="text-xs text-ndp-text-dim w-full">Run this command on the REX server. It expires after one hour.</p><code className="text-xs break-all flex-1">{command}</code><button type="button" className="btn-secondary" onClick={() => void copyToClipboard(command).then(ok => showToast(ok ? 'Copied' : 'Could not copy', ok ? 'success' : 'error'))}><Copy className="w-4 h-4" /></button></div>}
    <div className="admin-row flex-wrap gap-2"><button type="button" className="btn-secondary text-sm" disabled={busy || !host} onClick={() => void act(async () => { await api.post('/admin/rex/helper/test'); showToast('REX host connected', 'success'); })}>Test connection</button>
      <p className="text-xs text-ndp-text-dim">The helper can update only the configured REX container.</p></div>
    <div className="admin-row flex-wrap gap-2"><div className="flex-1 min-w-[12rem]"><p className="text-sm font-medium text-ndp-text">Update REX</p><p className="text-xs text-ndp-text-dim">{job?.phase || state.running?.phase || state.lastAuto?.result || 'Requires a GitHub release connection and a fixed Docker image tag.'}</p></div>
      <button type="button" className="btn-secondary text-sm" disabled={busy || !connected || job?.status === 'running' || !!state.running} onClick={() => setAsk(true)}>Update now</button></div>
    <div className="admin-row"><div className="flex-1"><p className="text-sm text-ndp-text">Update automatically overnight</p><p className="text-xs text-ndp-text-dim">Checks for a newer release at 06:45 UTC.</p></div><Switch checked={state.autoUpdate} disabled={busy || !connected} label="Update REX automatically" onChange={value => void act(async () => { await api.put('/admin/rex/update', { autoUpdate: value }); })} /></div>
    <ConfirmModal open={ask} title="Update REX now?" confirmLabel="Update" description="REX will restart briefly. LeMedia checks the server afterwards and attempts to restore the previous image if it does not come back." onClose={() => setAsk(false)} onConfirm={async () => { await act(async () => { const { data } = await api.post<{ jobId: string }>('/admin/rex/update'); setJob({ id: data.jobId, status: 'running', phase: 'Starting REX update' }); }); }} />
  </div>;
}
