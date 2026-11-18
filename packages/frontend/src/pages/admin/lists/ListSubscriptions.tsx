import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, ChevronDown, Pencil, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';
import { ArrTargets, targetsComplete } from './ArrTargets';
import { WweReview } from './WweReview';
import { timeAgo, typeLabel, useArrChoices, useJob, type AddResult, type AddSettings, type ItemType, type Job } from './shared';
import { Spinner } from '@/components/Spinner';

interface Subscription {
  id: number;
  url: string;
  name: string | null;
  provider: string;
  mediaType: ItemType | 'mixed';
  enabled: boolean;
  settings: AddSettings;
  seenCount: number;
  lastNew: { key: string; title: string }[];
  history: { key: string; title: string; service: string; at: string }[];
  lastResult: { added: number; skipped: number; failed: number; blocked: number; failures?: { key: string; title: string; error: string }[] } | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  nextSyncAt: string | null;
}
interface SubsResp { intervalHours: number; busy: Job | null; subscriptions: Subscription[] }

const PROVIDER: Record<string, string> = {
  dmm: 'DMM', trakt: 'Trakt', 'trakt-chart': 'Trakt', 'trakt-watchlist': 'Trakt', 'trakt-genre': 'DMM genre', mdblist: 'MDBList',
  'mdblist-top': 'DMM browse', 'mdblist-search': 'DMM browse', 'tmdb-list': 'TMDB', 'tmdb-chart': 'TMDB', 'tmdb-trending': 'TMDB',
  cinemeta: 'Cinemeta', custom: 'Handmade', wwe: 'WWE', imdb: 'IMDb',
};

/** Admin → Lists → Subscriptions: every list that keeps feeding Radarr/Sonarr. */
export function ListSubscriptions({ onAdd }: Readonly<{ onAdd: () => void }>) {
  const [data, setData] = useState<SubsResp | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [del, setDel] = useState<Subscription | null>(null);

  const load = useCallback(async () => {
    try { const { data: d } = await api.get<SubsResp>('/admin/lists/subscriptions'); setData(d); if (d.busy && !jobId) setJobId(d.busy.id); }
    catch (err) { toastApiError(err, 'Could not load list subscriptions'); }
  }, [jobId]);
  useEffect(() => { void load(); }, [load]);

  const job = useJob(jobId, (j) => {
    setJobId(null);
    if (j.status === 'failed') showToast(j.error ?? 'Sync failed', 'error');
    else if (j.kind === 'sync' || j.kind === 'retry') {
      const r = j.result as AddResult | Record<string, { added?: number }>;
      const added = 'added' in r && Array.isArray(r.added) ? r.added.length : Object.values(r as Record<string, { added?: number }>).reduce((n, x) => n + (x?.added ?? 0), 0);
      showToast(added ? `Sync done, added ${added}` : 'Sync done, nothing new to add', 'success');
    }
    void load();
  });

  const action = async (s: Subscription, what: 'sync' | 'retry') => {
    try { const { data: d } = await api.post<{ jobId: string }>(`/admin/lists/subscriptions/${s.id}/${what}`); setJobId(d.jobId); }
    catch (err) { toastApiError(err, 'Could not start'); }
  };

  const patch = async (s: Subscription, body: Partial<Pick<Subscription, 'enabled' | 'name' | 'settings'>>) => {
    try { await api.patch(`/admin/lists/subscriptions/${s.id}`, body); await load(); }
    catch (err) { toastApiError(err, 'Could not save'); }
  };

  if (!data) return <div className="admin-group admin-row justify-center py-10 text-sm text-ndp-text-dim"><Spinner size="sm" className="mr-2" />Loading…</div>;

  const busy = !!jobId;
  return (
    <div className="space-y-4">
      {busy && (
        <div className="flex items-center gap-3 rounded-xl bg-ndp-accent/10 ring-1 ring-inset ring-ndp-accent/25 px-4 py-2.5">
          <Spinner size="sm" />
          <p className="flex-1 min-w-0 text-sm text-ndp-text truncate">
            {job?.progress?.phase ?? 'Working…'}{job?.progress?.total ? ` (${job.progress.done} of ${job.progress.total})` : ''}
            <span className="text-ndp-text-dim">, runs in the background, you can leave this page</span>
          </p>
        </div>
      )}

      {data.subscriptions.length === 0 ? (
        <div className="admin-group admin-row flex-col items-start gap-2 py-6">
          <p className="text-sm text-ndp-text">No list subscriptions yet.</p>
          <button type="button" className="text-sm text-ndp-accent hover:underline" onClick={onAdd}>Add a list</button>
        </div>
      ) : (
        <div className="admin-group divide-y divide-white/[0.06]">
          {data.subscriptions.map((s) => {
            const r = s.lastResult;
            const expanded = open === s.id;
            const isUrl = s.url.startsWith('https://');
            return (
              <div key={s.id}>
                <div className="admin-row">
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setOpen(expanded ? null : s.id)}>
                    <div className="flex items-center gap-2 min-w-0">
                      <p className={clsx('text-[15px] font-medium truncate', s.enabled ? 'text-ndp-text' : 'text-ndp-text-dim')}>{s.name ?? s.url}</p>
                      <ChevronDown className={clsx('w-4 h-4 text-ndp-text-dim flex-shrink-0 transition-transform', expanded && 'rotate-180')} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {!s.enabled && <span className="admin-chip bg-amber-500/15 text-amber-300">Paused</span>}
                      <span className="admin-chip">{PROVIDER[s.provider] ?? s.provider}</span>
                      <span className="admin-chip">{typeLabel(s.mediaType)}</span>
                      {s.settings.search && <span className="admin-chip">Search on add</span>}
                      {s.settings.onlyNew && <span className="admin-chip">Only new</span>}
                      <span className="text-xs text-ndp-text-dim">
                        {s.lastCheckedAt ? `Synced ${timeAgo(s.lastCheckedAt)}` : 'Not synced yet'}
                        {s.enabled && s.nextSyncAt ? `, next ${new Date(s.nextSyncAt).getTime() <= Date.now() ? 'soon' : timeAgo(s.nextSyncAt)}` : ''}
                        {r ? ` · added ${r.added}, blocked ${r.blocked}${r.failed ? `, failed ${r.failed}` : ''}` : ''}
                      </span>
                    </div>
                    {s.lastError && <p className={clsx('text-xs mt-1 flex items-center gap-1', s.enabled ? 'text-amber-300' : 'text-ndp-text-dim')}><AlertTriangle className="w-3 h-3 flex-shrink-0" />{s.lastError}</p>}
                  </button>
                  <Switch checked={s.enabled} onChange={(v) => void patch(s, { enabled: v })} label={s.enabled ? 'Pause syncing' : 'Resume syncing'} className="-mr-1.5" />
                </div>
                {expanded && (
                  <div className="px-4 pb-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary !py-1.5 text-sm inline-flex items-center gap-1.5" disabled={busy} onClick={() => void action(s, 'sync')}><RefreshCw className="w-3.5 h-3.5" />Sync now</button>
                      {!!r?.failures?.length && <button type="button" className="btn-secondary !py-1.5 text-sm inline-flex items-center gap-1.5" disabled={busy} onClick={() => void action(s, 'retry')}><RotateCcw className="w-3.5 h-3.5" />Retry {r.failures.length} failed</button>}
                      <button type="button" className="btn-secondary !py-1.5 text-sm inline-flex items-center gap-1.5" onClick={() => setEditing(editing === s.id ? null : s.id)}><Pencil className="w-3.5 h-3.5" />Edit</button>
                      <button type="button" className="btn-secondary !py-1.5 text-sm inline-flex items-center gap-1.5 text-red-300" disabled={busy} onClick={() => setDel(s)}><Trash2 className="w-3.5 h-3.5" />Remove</button>
                      {isUrl && <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-ndp-accent hover:underline self-center ml-1">Open list</a>}
                    </div>
                    {s.provider === 'wwe' && <WweReview />}
                    {editing === s.id && <EditSubscription sub={s} onSave={async (body) => { await patch(s, body); setEditing(null); }} />}
                    <p className="text-xs text-ndp-text-dim">{s.seenCount} titles on the list at the last sync.</p>
                    {!!r?.failures?.length && (
                      <Section title="Failed last time">
                        {r.failures.map((f) => <Line key={f.key} title={f.title} note={f.error} tone="text-red-300" />)}
                      </Section>
                    )}
                    {s.lastNew.length > 0 && (
                      <Section title="New on the list at the last sync">
                        {s.lastNew.slice(0, 15).map((n) => <Line key={n.key} title={n.title} />)}
                      </Section>
                    )}
                    <Section title="Recently added">
                      {s.history.length ? s.history.map((h, i) => <Line key={`${h.key}-${i}`} title={h.title} note={`${h.service === 'sonarr' ? 'Sonarr' : 'Radarr'}, ${timeAgo(h.at)}`} />)
                        : <p className="admin-row !min-h-0 !py-2 text-sm text-ndp-text-dim">Nothing added yet.</p>}
                    </Section>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="admin-hint">Each list is re-read every {data.intervalHours} hours (change it under Settings). Only titles that aren't in your library and pass the filters are added; nothing is ever removed.</p>

      <ArrLists onChanged={load} />

      <ConfirmModal open={!!del} title={`Remove ${del?.name ?? 'this list'}?`} tone="danger" confirmLabel="Remove"
        description="LeMedia stops syncing this list. Titles it already added stay in Radarr and Sonarr."
        onClose={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          try { await api.delete(`/admin/lists/subscriptions/${del.id}`); showToast('List removed', 'success'); await load(); }
          catch (err) { toastApiError(err, 'Could not remove the list'); }
        }} />
    </div>
  );
}

function EditSubscription({ sub, onSave }: Readonly<{ sub: Subscription; onSave: (body: { name: string; settings: AddSettings }) => Promise<void> }>) {
  const choices = useArrChoices();
  const [name, setName] = useState(sub.name ?? '');
  const [settings, setSettings] = useState<AddSettings>(sub.settings);
  const types: ItemType[] = sub.mediaType === 'mixed' ? ['movie', 'show'] : [sub.mediaType];
  return (
    <div className="space-y-3 rounded-xl bg-white/[0.02] ring-1 ring-inset ring-white/[0.06] p-3">
      <input className="input !py-2 w-full" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Name" />
      <ArrTargets choices={choices} types={types} value={settings} onChange={setSettings} showOnlyNew />
      <button type="button" className="btn-primary !py-1.5 text-sm" disabled={!targetsComplete(types, settings, !!choices?.dmm)} onClick={() => void onSave({ name, settings })}>Save</button>
    </div>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div>
      <p className="admin-group-label !mb-1">{title}</p>
      <div className="rounded-xl ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06]">{children}</div>
    </div>
  );
}

function Line({ title, note, tone }: Readonly<{ title: string; note?: string; tone?: string }>) {
  return (
    <div className="admin-row !min-h-0 !py-2 text-sm">
      <span className="flex-1 min-w-0 truncate text-ndp-text">{title}</span>
      {note && <span className={clsx('text-xs truncate max-w-[55%]', tone ?? 'text-ndp-text-dim')} title={note}>{note}</span>}
    </div>
  );
}

interface ArrList { app: 'radarr' | 'sonarr'; id: number; name: string; implementation: string; autoAdd: boolean; enabled: boolean; link: string | null; inLeMedia: boolean }

/** Import lists set up inside Radarr/Sonarr. Those LeMedia can read can be moved here, so they go
 *  through the filters; the *arr's own auto-add for them is switched off. */
function ArrLists({ onChanged }: Readonly<{ onChanged: () => Promise<void> }>) {
  const [lists, setLists] = useState<ArrList[] | null>(null);
  const [ask, setAsk] = useState<ArrList | null>(null);
  const load = useCallback(async () => {
    try { const { data } = await api.get<ArrList[]>('/admin/lists/arr-lists'); setLists(data); } catch { setLists([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!lists?.length) return null;
  return (
    <div>
      <p className="admin-group-label">Lists set up in Radarr and Sonarr</p>
      <div className="admin-group divide-y divide-white/[0.06]">
        {lists.map((l) => (
          <div key={`${l.app}-${l.id}`} className="admin-row">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ndp-text truncate">{l.name}</p>
              <p className="text-xs text-ndp-text-dim truncate">
                {l.app === 'radarr' ? 'Radarr' : 'Sonarr'} · {l.implementation}
                {l.autoAdd ? `, ${l.app === 'radarr' ? 'Radarr' : 'Sonarr'} adds from it itself (no filters)` : ', auto-add off'}
              </p>
            </div>
            {l.inLeMedia ? <span className="admin-chip bg-emerald-500/15 text-emerald-300">In LeMedia</span>
              : l.link ? <button type="button" className="btn-secondary !py-1.5 text-sm whitespace-nowrap" onClick={() => setAsk(l)}>Move to LeMedia</button>
              : <span className="admin-chip">Not supported</span>}
          </div>
        ))}
      </div>
      <p className="admin-hint">Moving a list here runs it through LeMedia's filters and switches off Radarr's or Sonarr's own auto-add for it. The list itself stays in Radarr or Sonarr.</p>
      <ConfirmModal open={!!ask} title={`Move ${ask?.name ?? 'this list'} to LeMedia?`} confirmLabel="Move"
        description={`LeMedia will sync it every few hours through the filters${ask?.autoAdd ? `, and ${ask.app === 'radarr' ? 'Radarr' : 'Sonarr'}'s own auto-add for this list is switched off` : ''}.`}
        onClose={() => setAsk(null)}
        onConfirm={async () => {
          if (!ask) return;
          try { await api.post('/admin/lists/arr-lists/adopt', { app: ask.app, id: ask.id }); showToast(`${ask.name} moved to LeMedia`, 'success'); await load(); await onChanged(); }
          catch (err) { toastApiError(err, 'Could not move the list'); }
        }} />
    </div>
  );
}
