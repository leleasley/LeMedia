import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ChevronDown, Loader2, Play, RefreshCw, Rss, Search, Settings2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { showToast, toastApiError } from '@/utils/toast';
import { AdminTabLayout } from './AdminTabLayout';
import { ArrOverview } from './arr/ArrOverview';
import { LogConsole } from './arr/LogConsole';
import { ago, type AppOverview, type ArrJob } from './arr/shared';
import { Spinner } from '@/components/Spinner';

type View = 'overview' | 'indexers' | 'apps' | 'history' | 'console';
const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'indexers', label: 'Indexers' }, { id: 'apps', label: 'Apps' },
  { id: 'history', label: 'History' }, { id: 'console', label: 'Console' },
];

interface Field { name: string; label: string; type: string; value: unknown; secret: boolean; helpText: string | null; options: { value: unknown; name: string }[] | null }
interface Indexer {
  id: number; name: string; enable: boolean; priority: number; protocol: string; privacy: string | null; definition: string | null; url: string | null;
  status: { disabledTill: string | null; mostRecentFailure: string | null } | null;
  stats: { queries: number; grabs: number; failedQueries: number; failedGrabs: number; rss: number; avgMs: number } | null;
  fields: Field[];
}

/** Admin → Media → Prowlarr: the indexer manager behind Radarr and Sonarr. */
export function ProwlarrTab() {
  const [params, setParams] = useSearchParams();
  const v = params.get('view') as View | null;
  const view: View = v && VIEWS.some((x) => x.id === v) ? v : 'overview';
  const setView = (next: View) => setParams((p) => { const n = new URLSearchParams(p); n.set('view', next); return n; }, { replace: true });

  return (
    <AdminTabLayout>
      <div className="space-y-5">
        <div className="flex gap-1 border-b border-white/[0.06] overflow-x-auto" role="tablist">
          {VIEWS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={view === x.id} onClick={() => setView(x.id)}
              className={clsx('relative px-3.5 h-11 text-sm font-medium whitespace-nowrap transition-colors', view === x.id ? 'text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text')}>
              {x.label}
              {view === x.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-ndp-accent" aria-hidden />}
            </button>
          ))}
        </div>
        {view === 'overview' && <Overview onSettings={() => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', 'arr'); n.set('view', 'settings'); return n; })} />}
        {view === 'indexers' && <Indexers />}
        {view === 'apps' && <Apps />}
        {view === 'history' && <History />}
        {view === 'console' && <LogConsole app="prowlarr" />}
      </div>
    </AdminTabLayout>
  );
}

function Overview({ onSettings }: Readonly<{ onSettings: () => void }>) {
  const [data, setData] = useState<{ apps: AppOverview[]; helper: boolean; jobs: ArrJob[] } | null>(null);
  const load = useCallback(async (fresh = false) => {
    try { const { data: d } = await api.get(`/admin/arr/overview${fresh ? '?fresh=1' : ''}`); setData(d); } catch { /* keep */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <div className="admin-group admin-row justify-center py-12 text-sm text-ndp-text-dim"><Spinner size="sm" />Asking Prowlarr…</div>;
  return (
    <div className="max-w-2xl">
      <ArrOverview apps={data.apps.filter((a) => a.app === 'prowlarr')} helper={data.helper} jobs={data.jobs} onChanged={() => void load(true)} onSettings={onSettings} />
    </div>
  );
}

// ─── Indexers ────────────────────────────────────────────────────────

function Indexers() {
  const [list, setList] = useState<Indexer[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [tests, setTests] = useState<Record<number, { ok: boolean; message: string | null } | 'running'>>({});
  const [testingAll, setTestingAll] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get<Indexer[]>('/admin/prowlarr/indexers'); setList(data); }
    catch (err) { toastApiError(err, 'Could not load the indexers'); setList([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = async (i: Indexer, body: Record<string, unknown>, ok?: string) => {
    try { await api.patch(`/admin/prowlarr/indexers/${i.id}`, body); if (ok) showToast(ok, 'success'); await load(); }
    catch (err) { toastApiError(err, 'Prowlarr refused the change'); await load(); }
  };
  const test = async (i: Indexer) => {
    setTests((t) => ({ ...t, [i.id]: 'running' }));
    try { const { data } = await api.post<{ ok: boolean; message: string | null }>(`/admin/prowlarr/indexers/${i.id}/test`); setTests((t) => ({ ...t, [i.id]: data })); }
    catch (err) { toastApiError(err, 'Test failed'); setTests((t) => { const n = { ...t }; delete n[i.id]; return n; }); }
  };
  const testAll = async () => {
    setTestingAll(true);
    try {
      const { data } = await api.post<{ id: number; ok: boolean; message: string | null }[]>('/admin/prowlarr/indexers/test-all', {}, { timeout: 320_000 });
      setTests(Object.fromEntries(data.map((r) => [r.id, { ok: r.ok, message: r.message }])));
      const bad = data.filter((r) => !r.ok).length;
      showToast(bad ? `${bad} indexer${bad === 1 ? '' : 's'} failed the test` : 'Every indexer passed', bad ? 'error' : 'success');
    } catch (err) { toastApiError(err, 'Test failed'); }
    finally { setTestingAll(false); }
  };

  if (!list) return <div className="admin-group admin-row justify-center py-12 text-sm text-ndp-text-dim"><Spinner size="sm" />Loading indexers…</div>;
  const totals = list.reduce((t, i) => ({ q: t.q + (i.stats?.queries ?? 0), g: t.g + (i.stats?.grabs ?? 0) }), { q: 0, g: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ndp-text-dim flex-1">{list.filter((i) => i.enable).length} of {list.length} enabled · {totals.q.toLocaleString()} searches · {totals.g.toLocaleString()} grabs</p>
        <button type="button" className="btn-secondary !py-2 text-sm inline-flex items-center gap-1.5" disabled={testingAll} onClick={() => void testAll()}>
          {testingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Test all
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((i) => {
          const failing = !!i.status?.disabledTill && new Date(i.status.disabledTill).getTime() > Date.now();
          const t = tests[i.id];
          const failRate = i.stats && i.stats.queries ? Math.round((i.stats.failedQueries / i.stats.queries) * 1000) / 10 : 0;
          return (
            <div key={i.id} className={clsx('rounded-2xl bg-ndp-surface ring-1 ring-inset', failing ? 'ring-red-500/30' : 'ring-white/[0.06]')}>
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={clsx('text-[15px] font-medium truncate', i.enable ? 'text-ndp-text' : 'text-ndp-text-dim')}>{i.name}</p>
                    <span className="admin-chip">{i.protocol}</span>
                    {i.privacy && <span className="admin-chip capitalize">{i.privacy}</span>}
                    {failing && <span className="admin-chip bg-red-500/15 text-red-300">Paused until {new Date(i.status!.disabledTill!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p className="text-xs text-ndp-text-dim mt-1 truncate">{[i.definition, i.url].filter(Boolean).join(' · ')}</p>
                  {i.status?.mostRecentFailure && <p className="text-xs text-amber-300/90 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Last failure {ago(i.status.mostRecentFailure)}</p>}
                </div>
                <Switch checked={i.enable} onChange={(on) => void patch(i, { enable: on }, on ? `${i.name} enabled` : `${i.name} disabled`)} label={`Enable ${i.name}`} className="-mr-1.5" />
              </div>
              {i.stats && (
                <div className="grid grid-cols-4 gap-px bg-white/[0.06] border-y border-white/[0.06]">
                  {([['Searches', i.stats.queries.toLocaleString()], ['Grabs', i.stats.grabs.toLocaleString()], ['Failed', `${failRate}%`], ['Speed', `${(i.stats.avgMs / 1000).toFixed(1)} s`]] as const).map(([l, val]) => (
                    <div key={l} className="bg-ndp-surface px-4 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ndp-text-dim">{l}</p>
                      <p className={clsx('text-lg font-medium tabular-nums leading-tight mt-0.5', l === 'Failed' && failRate > 5 ? 'text-amber-300' : 'text-ndp-text')}>{val}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                <label className="text-xs text-ndp-text-dim flex items-center gap-2">Priority
                  <input type="number" min={1} max={50} defaultValue={i.priority} key={`${i.id}-${i.priority}`} className="input !py-1 !px-2 w-16 text-sm"
                    onBlur={(e) => { const p = Number(e.target.value); if (p !== i.priority) void patch(i, { priority: p }, `${i.name} priority set to ${p}`); }} />
                </label>
                <span className="flex-1" />
                {t && t !== 'running' && (
                  <span className={clsx('text-xs flex items-center gap-1 max-w-[50%]', t.ok ? 'text-emerald-400' : 'text-red-300')} title={t.message ?? undefined}>
                    {t.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}<span className="truncate">{t.ok ? 'Works' : t.message ?? 'Failed'}</span>
                  </span>
                )}
                <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5" disabled={t === 'running'} onClick={() => void test(i)}>
                  {t === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}Test
                </button>
                {i.fields.length > 0 && (
                  <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5" onClick={() => setOpen(open === i.id ? null : i.id)}>
                    <Settings2 className="w-3.5 h-3.5" />Settings<ChevronDown className={clsx('w-3 h-3 transition-transform', open === i.id && 'rotate-180')} />
                  </button>
                )}
              </div>
              {open === i.id && <IndexerSettings i={i} onSave={(fields) => patch(i, { fields }, `${i.name} saved`)} />}
            </div>
          );
        })}
      </div>
      <p className="admin-hint">Adding a new indexer is done in Prowlarr itself (it needs the indexer's own sign-up details). Changes here go straight to Prowlarr, which syncs them to Radarr and Sonarr.</p>
    </div>
  );
}

function IndexerSettings({ i, onSave }: Readonly<{ i: Indexer; onSave: (fields: Record<string, unknown>) => Promise<void> }>) {
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(i.fields.map((f) => [f.name, f.secret ? '' : f.value])));
  const [saving, setSaving] = useState(false);
  return (
    <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
      {i.fields.map((f) => (
        <div key={f.name}>
          {f.type === 'checkbox' ? (
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-ndp-text">{f.label}</span>
              <Switch checked={!!values[f.name]} onChange={(v) => setValues({ ...values, [f.name]: v })} label={f.label} />
            </label>
          ) : (
            <label className="block">
              <span className="text-xs text-ndp-text-dim">{f.label}</span>
              {f.options ? (
                <select className="input !py-2 w-full mt-1 text-sm" value={String(values[f.name] ?? '')} onChange={(e) => setValues({ ...values, [f.name]: f.options!.find((o) => String(o.value) === e.target.value)?.value })}>
                  {f.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.name}</option>)}
                </select>
              ) : (
                <input className="input !py-2 w-full mt-1 text-sm" type={f.secret || f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'} autoComplete="off"
                  placeholder={f.secret ? 'Saved, type to replace' : undefined} value={String(values[f.name] ?? '')}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              )}
            </label>
          )}
          {f.helpText && <p className="text-[11px] text-ndp-text-dim mt-0.5">{f.helpText}</p>}
        </div>
      ))}
      <button type="button" className="btn-primary !py-2 text-sm inline-flex items-center gap-1.5" disabled={saving}
        onClick={async () => { setSaving(true); await onSave(values); setSaving(false); }}>
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save
      </button>
    </div>
  );
}

// ─── Apps ────────────────────────────────────────────────────────────

function Apps() {
  const [apps, setApps] = useState<{ id: number; name: string; kind: string | null; syncLevel: string; url: string | null }[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => { api.get('/admin/prowlarr/apps').then(({ data }) => setApps(data)).catch((err) => { toastApiError(err, 'Could not load the apps'); setApps([]); }); }, []);
  const SYNC: Record<string, string> = { fullSync: 'Full sync', addOnly: 'Add only', disabled: 'Off' };
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="admin-group divide-y divide-white/[0.06]">
        {!apps && <p className="admin-row text-sm text-ndp-text-dim"><Spinner size="sm" />Loading…</p>}
        {apps?.length === 0 && <p className="admin-row text-sm text-ndp-text-dim">Prowlarr isn't connected to any apps.</p>}
        {apps?.map((a) => (
          <div key={a.id} className="admin-row">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-ndp-text">{a.name}</p>
              <p className="text-xs text-ndp-text-dim truncate">{[a.kind, a.url].filter(Boolean).join(' · ')}</p>
            </div>
            <span className={clsx('admin-chip', a.syncLevel === 'fullSync' ? 'bg-emerald-500/15 text-emerald-300' : '')}>{SYNC[a.syncLevel] ?? a.syncLevel}</span>
          </div>
        ))}
      </div>
      <button type="button" className="btn-primary text-sm inline-flex items-center gap-1.5" disabled={syncing}
        onClick={async () => { setSyncing(true); try { await api.post('/admin/prowlarr/apps/sync'); showToast('Prowlarr is pushing its indexers to the apps', 'success'); } catch (err) { toastApiError(err, 'Could not start the sync'); } finally { setSyncing(false); } }}>
        <RefreshCw className={clsx('w-4 h-4', syncing && 'animate-spin')} />Sync indexers to apps
      </button>
      <p className="admin-hint">Full sync keeps each app's indexer list exactly matching Prowlarr. Prowlarr also does this by itself; the button forces it now.</p>
    </div>
  );
}

// ─── History ─────────────────────────────────────────────────────────

interface HistItem { id: number; date: string; kind: string; ok: boolean; indexer: string; query: string | null; source: string | null; results: number | null; elapsedMs: number | null }

function History() {
  const [items, setItems] = useState<HistItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('all');
  const load = useCallback(async (p = 1) => {
    try { const { data } = await api.get<{ items: HistItem[] }>(`/admin/prowlarr/history?page=${p}`); setItems((prev) => (p === 1 ? data.items : [...(prev ?? []), ...data.items])); setPage(p); }
    catch (err) { toastApiError(err, 'Could not load the history'); setItems([]); }
  }, []);
  useEffect(() => { void load(1); }, [load]);
  const shown = useMemo(() => (items ?? []).filter((i) => kind === 'all' || (kind === 'failed' ? !i.ok : i.kind === kind)), [items, kind]);
  const ICON = { search: Search, grab: ArrowDownToLine, rss: Rss } as Record<string, typeof Search>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[['all', 'All'], ['search', 'Searches'], ['grab', 'Grabs'], ['rss', 'RSS'], ['failed', 'Failed']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={clsx('px-3 py-1.5 rounded-lg text-sm ring-1 ring-inset', kind === k ? 'bg-ndp-accent/15 ring-ndp-accent/40 text-ndp-text' : 'bg-ndp-surface ring-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>{l}</button>
        ))}
      </div>
      <div className="admin-group divide-y divide-white/[0.06]">
        {!items && <p className="admin-row text-sm text-ndp-text-dim"><Spinner size="sm" />Loading…</p>}
        {items && shown.length === 0 && <p className="admin-row text-sm text-ndp-text-dim">Nothing here in the loaded history.</p>}
        {shown.map((i) => {
          const Icon = ICON[i.kind] ?? Search;
          return (
            <div key={i.id} className="admin-row !py-2.5">
              <span className={clsx('admin-icon-tile', !i.ok ? 'bg-red-500/15 text-red-400' : i.kind === 'grab' ? 'bg-emerald-500/15 text-emerald-400' : '')}><Icon className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ndp-text truncate">{i.query ?? (i.kind === 'rss' ? 'RSS sync' : 'Search without a query')}</p>
                <p className="text-xs text-ndp-text-dim truncate">{[i.indexer, i.source, i.results !== null ? `${i.results} results` : null, i.elapsedMs ? `${(i.elapsedMs / 1000).toFixed(1)} s` : null, i.ok ? null : 'failed'].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="text-[11px] text-ndp-text-dim whitespace-nowrap" title={new Date(i.date).toLocaleString()}>{ago(i.date)}</span>
            </div>
          );
        })}
        {items && items.length > 0 && <button type="button" className="admin-row w-full justify-center text-sm text-ndp-accent hover:bg-white/[0.03]" onClick={() => void load(page + 1)}>Load older</button>}
      </div>
    </div>
  );
}
