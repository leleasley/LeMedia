import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, ChevronDown, Copy, Loader2, PlugZap, Terminal } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';
import { APP_META, ago, type ArrApp } from './shared';
import { Spinner } from '@/components/Spinner';

interface Helper { configured: boolean; host: string; port: number; user: string; hasKey: boolean; authorizedKeysLine: string | null; verifiedAt: string | null; hostname: string | null; helperVersion: number | null; apps: string[] | null }
interface Settings { links: Partial<Record<ArrApp, string>>; helper: Helper }
type AppPick = { on: boolean; container: string; mode: 'tag' | 'pull' | 'none' };

const HELPER_URL = 'https://github.com/leleasley/LeMedia/blob/main/tools/lemedia-host-helper';
const PICKS: { app: string; label: string; mode: AppPick['mode']; hint: string }[] = [
  { app: 'sonarr', label: 'Sonarr', mode: 'tag', hint: 'restart, update to an exact version, logs' },
  { app: 'radarr', label: 'Radarr', mode: 'tag', hint: 'restart, update to an exact version, logs' },
  { app: 'prowlarr', label: 'Prowlarr', mode: 'tag', hint: 'restart, update to an exact version, logs' },
  { app: 'zurg', label: 'Zurg', mode: 'pull', hint: 'restart, pull the latest image, logs' },
];

function Copyable({ text }: Readonly<{ text: string }>) {
  return (
    <div className="flex gap-2">
      <code className="flex-1 min-w-0 rounded-lg bg-black/50 ring-1 ring-inset ring-white/[0.06] px-3 py-2 text-[11px] text-ndp-text-muted break-all font-mono">{text}</code>
      <button type="button" aria-label="Copy" className="btn-secondary !px-3 self-start" onClick={() => { void navigator.clipboard?.writeText(text); showToast('Copied', 'success'); }}><Copy className="w-4 h-4" /></button>
    </div>
  );
}

function Step({ n, title, done, children }: Readonly<{ n: number; title: string; done?: boolean; children: React.ReactNode }>) {
  return (
    <div className="admin-row items-start">
      <span className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5', done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.08] text-ndp-text')}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </span>
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-[15px] font-medium text-ndp-text">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** Host helper setup (restart / update / logs on the Docker host) and the links Open uses. */
export function ArrSettings({ onChanged }: Readonly<{ onChanged: () => void }>) {
  const [s, setS] = useState<Settings | null>(null);
  const [host, setHost] = useState(''); const [port, setPort] = useState(22); const [user, setUser] = useState('root');
  const [picks, setPicks] = useState<Record<string, AppPick>>(() => Object.fromEntries(PICKS.map((p) => [p.app, { on: true, container: p.app, mode: p.mode }])));
  const [command, setCommand] = useState<string | null>(null);
  const [links, setLinks] = useState<Partial<Record<ArrApp, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [askKey, setAskKey] = useState(false);
  const [manual, setManual] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Settings>('/admin/arr/settings');
      setS(data); setHost(data.helper.host); setPort(data.helper.port); setUser(data.helper.user); setLinks(data.links);
    } catch (err) { toastApiError(err, 'Could not load settings'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (name: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(name);
    try { await fn(); if (ok) showToast(ok, 'success'); await load(); onChanged(); return true; }
    catch (err) { toastApiError(err, 'That didn\'t work'); return false; }
    finally { setBusy(null); }
  };

  const makeCommand = async () => {
    setBusy('install');
    try {
      // Save the host details and make sure LeMedia has a key before the command is built.
      await api.put('/admin/arr/helper', { host, port, user });
      if (!s?.helper.hasKey) await api.post('/admin/arr/helper/key');
      const apps = Object.fromEntries(Object.entries(picks).filter(([, p]) => p.on).map(([app, p]) => [app, { container: p.container.trim() || app, mode: p.mode }]));
      const { data } = await api.post<{ token: string }>('/admin/arr/helper/install', { apps });
      setCommand(`curl -fsSL '${window.location.origin}/api/webhooks/host-helper/install?t=${data.token}' | sudo sh`);
      await load();
    } catch (err) { toastApiError(err, 'Could not make the install command'); }
    finally { setBusy(null); }
  };

  if (!s) return <div className="admin-group admin-row justify-center py-10 text-sm text-ndp-text-dim"><Spinner size="sm" />Loading…</div>;
  const h = s.helper;
  const hostOk = /^[A-Za-z0-9.-]+$/.test(host.trim());

  return (
    <div className="space-y-6 max-w-3xl">
      <section>
        <p className="admin-group-label">Host helper</p>
        <div className="admin-group">
          <div className="admin-row">
            <span className={clsx('admin-icon-tile', h.verifiedAt && 'bg-emerald-500/15 text-emerald-400')}>{h.verifiedAt ? <CheckCircle2 className="w-4 h-4" /> : <PlugZap className="w-4 h-4" />}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-ndp-text">{h.verifiedAt ? `Connected to ${h.hostname ?? h.host}` : 'Not connected'}</p>
              <p className="text-xs text-ndp-text-dim">
                {h.verifiedAt
                  ? `Checked ${ago(h.verifiedAt)}${h.apps?.length ? `, manages ${h.apps.join(', ')}` : ''}.`
                  : 'Lets LeMedia restart and update your containers and read their logs, over SSH. Without it, restart asks the app itself and logs come from the app; updates need it.'}
              </p>
            </div>
          </div>
        </div>
        <p className="admin-hint">LeMedia gets its own SSH key, and that key can only run one small script on the Docker host. The script restarts, updates (to an exact version) and reads logs of the containers you pick here, and refuses everything else.</p>
      </section>

      <section className="admin-group divide-y divide-white/[0.06]">
        <Step n={1} title="Where are the containers?" done={!!h.host && hostOk}>
          <div className="flex flex-wrap gap-2">
            <input className="input !py-2 flex-[2] min-w-[10rem]" placeholder="Docker host, e.g. 192.168.1.20" value={host} onChange={(e) => setHost(e.target.value)} aria-label="Docker host" />
            <input className="input !py-2 w-20" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} aria-label="SSH port" />
            <input className="input !py-2 w-28" value={user} onChange={(e) => setUser(e.target.value)} aria-label="SSH user" />
          </div>
          <p className="text-xs text-ndp-text-dim">The machine running Docker, its SSH port, and the user LeMedia logs in as. <code>root</code> is simplest; another user must be in the <code>docker</code> group and able to edit your compose files. If LeMedia runs on the same machine, use its LAN address.</p>
        </Step>

        <Step n={2} title="Which containers may it manage?">
          <div className="rounded-xl ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06]">
            {PICKS.map((p) => {
              const v = picks[p.app];
              return (
                <div key={p.app} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-24 flex-shrink-0">
                    <p className={clsx('text-sm', v.on ? 'text-ndp-text' : 'text-ndp-text-dim')}>{p.label}</p>
                    <p className="text-[11px] text-ndp-text-dim leading-tight hidden sm:block">{p.hint}</p>
                  </div>
                  <input className="input !py-1.5 flex-1 min-w-0 text-sm" disabled={!v.on} value={v.container} aria-label={`${p.label} container name`}
                    onChange={(e) => setPicks({ ...picks, [p.app]: { ...v, container: e.target.value } })} />
                  <Switch checked={v.on} onChange={(on) => setPicks({ ...picks, [p.app]: { ...v, on } })} label={`Manage ${p.label}`} />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ndp-text-dim">The container name as Docker shows it (<code>docker ps</code>). Compose files and images are read from the containers themselves. Updates use LinuxServer image tags; other images can still be restarted and their logs read.</p>
        </Step>

        <Step n={3} title="Run the install command on the Docker host">
          <button type="button" className="btn-primary !py-2 text-sm inline-flex items-center gap-1.5" disabled={!hostOk || busy === 'install' || !Object.values(picks).some((p) => p.on)} onClick={() => void makeCommand()}>
            {busy === 'install' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}{command ? 'Make a new command' : 'Make the install command'}
          </button>
          {command && (
            <>
              <Copyable text={command} />
              <p className="text-xs text-ndp-text-dim">Paste it into a terminal on {host || 'the Docker host'}. It works for one hour, needs <code>python3</code> and <code>docker</code> there, and only adds LeMedia's public key (locked to the helper). The Docker host must be able to reach this LeMedia address; if it can't, use the manual steps below.</p>
            </>
          )}
          <button type="button" className="text-xs text-ndp-accent hover:underline flex items-center gap-1" onClick={() => setManual(!manual)}>
            Manual steps<ChevronDown className={clsx('w-3 h-3 transition-transform', manual && 'rotate-180')} />
          </button>
          {manual && (
            <div className="space-y-2 text-xs text-ndp-text-dim">
              <p>1. Copy <a href={HELPER_URL} target="_blank" rel="noreferrer" className="text-ndp-accent hover:underline">lemedia-host-helper</a> to <code>/usr/local/bin/lemedia-host-helper</code> and <code>chmod 755</code> it.</p>
              <p>2. Optional: list your containers in <code>/etc/lemedia-host-helper.json</code>, e.g. <code>{'{"apps": {"sonarr": {}, "radarr": {}, "zurg": {"mode": "pull"}}}'}</code>. Without it, Sonarr, Radarr, Prowlarr and Zurg are allowed.</p>
              <p>3. Add this line to <code>~{user}/.ssh/authorized_keys</code>{h.authorizedKeysLine ? ':' : ' (create LeMedia\'s key first, with the button above)'}</p>
              {h.authorizedKeysLine && <Copyable text={h.authorizedKeysLine} />}
            </div>
          )}
        </Step>

        <Step n={4} title="Test the connection" done={!!h.verifiedAt}>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary !py-2 text-sm inline-flex items-center gap-1.5" disabled={!h.hasKey || !hostOk || busy === 'test'}
              onClick={() => void act('test', async () => { await api.put('/admin/arr/helper', { host, port, user }); await api.post('/admin/arr/helper/test'); }, 'Connected')}>
              {busy === 'test' && <Loader2 className="w-4 h-4 animate-spin" />}Test connection
            </button>
            {h.hasKey && <button type="button" className="btn-secondary !py-2 text-sm" onClick={() => setAskKey(true)}>New key</button>}
          </div>
          <p className="text-xs text-ndp-text-dim">The first connection remembers the host's SSH fingerprint; if it later changes, LeMedia refuses to connect.</p>
        </Step>
      </section>

      <section>
        <p className="admin-group-label">Open links</p>
        <div className="admin-group divide-y divide-white/[0.06]">
          {(['sonarr', 'radarr', 'prowlarr'] as ArrApp[]).map((a) => (
            <div key={a} className="admin-row">
              <p className="text-sm text-ndp-text w-20 flex-shrink-0">{APP_META[a].name}</p>
              <input className="input !py-2 flex-1 min-w-0" placeholder="Same as the Services address" value={links[a] ?? ''} onChange={(e) => setLinks({ ...links, [a]: e.target.value })} />
            </div>
          ))}
        </div>
        <p className="admin-hint">Where "Open" takes you, e.g. a public address. Empty uses the address from Services.</p>
        <button type="button" className="btn-primary mt-3 text-sm" disabled={busy === 'links'} onClick={() => void act('links', () => api.put('/admin/arr/settings', { links }), 'Links saved')}>Save links</button>
      </section>

      <ConfirmModal open={askKey} tone="danger" title="Make a new key?" confirmLabel="New key"
        description="The old key stops working. Run a new install command (or update authorized_keys) before LeMedia can connect again."
        onClose={() => setAskKey(false)} onConfirm={async () => { await act('key', async () => { await api.post('/admin/arr/helper/key'); setCommand(null); }, 'New key created'); }} />
    </div>
  );
}
