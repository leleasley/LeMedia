import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, Eye, Loader2, Plus } from 'lucide-react';
import api from '@/lib/api';
import Switch from '@/components/ui/Switch';
import { showToast, toastApiError } from '@/utils/toast';
import { ArrTargets, targetsComplete } from './ArrTargets';
import { typeLabel, useArrChoices, useJob, type AddResult, type AddSettings, type ItemType, type Job, type ListItem, type Preview } from './shared';
import { Spinner } from '@/components/Spinner';

type Show = 'new' | 'existing' | 'blocked' | 'all';
const PAGE = 200;

const EXAMPLES = [
  'https://debridmediamanager.com/trakt/movies',
  'https://mdblist.com/lists/<user>/<list>',
  'https://trakt.tv/users/<user>/lists/<list>',
  'https://www.themoviedb.org/movie/top_rated',
];

/** Admin → Lists → Add a list: paste a link, see what's new, add it, and optionally subscribe. */
export function ListAdd({ initialUrl, defaults, onSubscribed }: Readonly<{ initialUrl?: string; defaults: Partial<AddSettings>; onSubscribed: () => void }>) {
  const choices = useArrChoices();
  const [url, setUrl] = useState(initialUrl ?? '');
  const [previewJob, setPreviewJob] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<Show>('new');
  const [limit, setLimit] = useState(PAGE);
  const [settings, setSettings] = useState<AddSettings>({ search: false, ...defaults });
  const [subscribe, setSubscribe] = useState(true);
  const [name, setName] = useState('');
  const [addJob, setAddJob] = useState<string | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);

  const startPreview = async (link = url) => {
    if (!link.trim()) return;
    setPreview(null); setResult(null); setAddJob(null);
    try {
      const { data } = await api.post<{ jobId: string }>('/admin/lists/preview', { url: link.trim() });
      setPreviewJob(data.jobId);
    } catch (err) { toastApiError(err, 'Could not read that list'); }
  };

  // A handmade list's "Preview and add" lands here with its custom:<id> address.
  useEffect(() => { if (initialUrl) { setUrl(initialUrl); void startPreview(initialUrl); } }, [initialUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const pJob = useJob(previewJob, async (j: Job) => {
    setPreviewJob(null);
    if (j.status === 'failed') { showToast(j.error ?? 'Could not read that list', 'error'); return; }
    try {
      const { data } = await api.get<Preview>(`/admin/lists/preview/${(j.result as { previewId: string }).previewId}`);
      setPreview(data);
      setSelected(new Set(data.items.filter((i) => !i.existing && !i.blocked).map((i) => i.key)));
      setShow(data.counts.missing ? 'new' : 'all');
      setLimit(PAGE);
      setName(data.source.label);
    } catch (err) { toastApiError(err, 'Could not load the preview'); }
  });

  const aJob = useJob(addJob, (j) => {
    setAddJob(null);
    if (j.status === 'failed') { showToast(j.error ?? 'The add failed', 'error'); return; }
    const r = j.result as AddResult;
    setResult(r);
    showToast(`Added ${r.added.length} of ${r.requested}${r.failed.length ? `, ${r.failed.length} failed` : ''}`, r.failed.length && !r.added.length ? 'error' : 'success');
  });

  const types = useMemo<ItemType[]>(() => {
    if (!preview) return [];
    const s = new Set(preview.items.map((i) => i.mediaType));
    if (!s.size && preview.source.mediaType !== 'mixed') s.add(preview.source.mediaType);
    return [...s];
  }, [preview]);

  const visible = useMemo(() => (preview?.items ?? []).filter((i) =>
    show === 'all' || (show === 'new' && !i.existing && !i.blocked) || (show === 'existing' && i.existing) || (show === 'blocked' && i.blocked && !i.existing)), [preview, show]);

  const addable = (preview?.items ?? []).filter((i) => !i.existing && !i.blocked);
  const toggle = (key: string) => setSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const ready = !!preview && targetsComplete(types, settings, !!choices?.dmm) && (selected.size > 0 || subscribe);

  const add = async () => {
    if (!preview) return;
    try {
      const { data } = await api.post<{ jobId: string }>('/admin/lists/add', { previewId: preview.id, keys: [...selected], settings, subscribe, name: name.trim() || undefined });
      setAddJob(data.jobId);
    } catch (err) { toastApiError(err, 'Could not start the add'); }
  };

  const running = pJob?.status === 'running' || !!previewJob;
  const adding = !!addJob;

  return (
    <div className="space-y-5">
      <div>
        <p className="admin-group-label">List link</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void startPreview(); }}>
          <input className="input flex-1 min-w-0" placeholder="Paste a DMM, Trakt, MDBList, TMDB or Cinemeta link" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className="btn-primary inline-flex items-center gap-2 whitespace-nowrap" disabled={running || !url.trim()}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Preview
          </button>
        </form>
        <p className="admin-hint break-words">Works with Debrid Media Manager, Trakt, MDBList, TMDB and Stremio Cinemeta links, for example <span className="text-ndp-text-muted">{EXAMPLES[0]}</span>. Trakt links need a Trakt client ID (under Settings). For WWE PPVs and premium live events, <button type="button" className="text-ndp-accent hover:underline" onClick={() => { setUrl('wwe:events'); void startPreview('wwe:events'); }}>preview the WWE events list</button>.</p>
      </div>

      {running && (
        <div className="admin-group admin-row justify-center gap-3 py-8 text-sm text-ndp-text-dim">
          <Spinner size="sm" /> Reading the list and checking it against Radarr and Sonarr…
        </div>
      )}

      {preview && (
        <>
          <div>
            <p className="admin-group-label">{preview.source.label} · {preview.source.providerName} · {typeLabel(preview.source.mediaType)}</p>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {([
                ['new', 'New', preview.counts.missing, 'text-emerald-300'],
                ['existing', 'In library', preview.counts.existing, 'text-ndp-text'],
                ['blocked', 'Blocked', preview.counts.blocked, 'text-amber-300'],
              ] as const).map(([key, label, n, tone]) => (
                <button key={key} type="button" onClick={() => { setShow(show === key ? 'all' : key); setLimit(PAGE); }}
                  className={clsx('text-left rounded-xl bg-ndp-surface ring-1 ring-inset px-4 py-3 transition-colors', show === key ? 'ring-ndp-accent/50 bg-ndp-accent/[0.06]' : 'ring-white/[0.06] hover:bg-white/[0.03]')}>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ndp-text-dim">{label}</span>
                  <p className={clsx('font-display text-3xl leading-none mt-1.5 tabular-nums', tone)}>{n}</p>
                </button>
              ))}
            </div>
            {preview.arrMissing.length > 0 && <p className="admin-hint text-amber-300">{preview.arrMissing.map((t) => (t === 'movie' ? 'Radarr' : 'Sonarr')).join(' and ')} isn't set up in Services, so those titles can't be added.</p>}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">
                {show === 'all' ? `All ${preview.counts.total}` : show === 'new' ? 'New titles' : show === 'existing' ? 'Already in your library' : 'Blocked'}
              </p>
              {show === 'new' && addable.length > 0 && (
                <div className="flex gap-3 text-xs">
                  <button type="button" className="text-ndp-accent hover:underline" onClick={() => setSelected(new Set(addable.map((i) => i.key)))}>Select all</button>
                  <button type="button" className="text-ndp-text-muted hover:underline" onClick={() => setSelected(new Set())}>Select none</button>
                </div>
              )}
            </div>
            <div className="admin-group divide-y divide-white/[0.06]">
              {visible.length === 0 && <p className="admin-row text-sm text-ndp-text-dim">{show === 'new' ? 'Nothing new: everything on this list is in your library or blocked.' : 'Nothing here.'}</p>}
              {visible.slice(0, limit).map((i) => <ItemRow key={i.key} item={i} checked={selected.has(i.key)} onToggle={() => toggle(i.key)} />)}
              {visible.length > limit && (
                <button type="button" className="admin-row w-full justify-center text-sm text-ndp-accent hover:bg-white/[0.03]" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({visible.length - limit} left)
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="admin-group-label">Add to</p>
            <ArrTargets choices={choices} types={types} value={settings} onChange={setSettings} showOnlyNew={subscribe} />
          </div>

          <div className="admin-group divide-y divide-white/[0.06]">
            <div className="admin-row">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ndp-text">Keep this list in sync</p>
                <p className="text-xs text-ndp-text-dim">Re-read the list on a schedule and add new titles automatically, through the same filters.</p>
              </div>
              <Switch checked={subscribe} onChange={setSubscribe} label="Keep this list in sync" className="-mr-1.5" />
            </div>
            {subscribe && (
              <div className="admin-row">
                <p className="text-sm text-ndp-text w-20 flex-shrink-0">Name</p>
                <input className="input !py-2 flex-1 min-w-0" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!ready || adding} onClick={() => void add()}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {selected.size ? `Add ${selected.size} title${selected.size === 1 ? '' : 's'}${subscribe ? ' and subscribe' : ''}` : 'Subscribe'}
            </button>
            {!targetsComplete(types, settings, !!choices?.dmm) && <p className="text-xs text-ndp-text-dim">Choose a quality profile and root folder first.</p>}
            {adding && aJob?.progress && <p className="text-sm text-ndp-text-dim">{aJob.progress.done} of {aJob.progress.total} · {aJob.progress.phase}</p>}
          </div>

          {result && (
            <div className="admin-group divide-y divide-white/[0.06]">
              <div className="admin-row">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="flex-1 text-sm text-ndp-text">Added {result.added.length}, skipped {result.skipped.length}, failed {result.failed.length}</p>
                {subscribe && <button type="button" className="text-sm text-ndp-accent hover:underline" onClick={onSubscribed}>View subscriptions</button>}
              </div>
              {[...result.failed.map((f) => ({ k: f.key, title: f.title, note: f.error, bad: true })), ...result.skipped.map((s) => ({ k: s.key, title: s.title, note: s.reason, bad: false }))].slice(0, 30).map((r) => (
                <div key={r.k} className="admin-row !min-h-0 !py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-ndp-text">{r.title}</span>
                  <span className={clsx('text-xs truncate max-w-[55%]', r.bad ? 'text-red-300' : 'text-ndp-text-dim')} title={r.note}>{r.note}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ItemRow({ item, checked, onToggle }: Readonly<{ item: ListItem; checked: boolean; onToggle: () => void }>) {
  const addable = !item.existing && !item.blocked;
  return (
    <label className={clsx('admin-row !min-h-0 !py-2.5', addable && 'cursor-pointer hover:bg-white/[0.03]')}>
      <input type="checkbox" className="accent-[var(--ndp-accent,#6366f1)] w-4 h-4 flex-shrink-0" disabled={!addable} checked={addable && checked} onChange={onToggle} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ndp-text truncate">{item.title} {item.year ? <span className="text-ndp-text-dim">({item.year})</span> : null}</p>
        {item.blocked && !item.existing && <p className="text-xs text-amber-300/90 truncate">{item.blockReason}</p>}
      </div>
      <span className="admin-chip">{item.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
      {item.existing ? <span className="admin-chip">In library</span> : item.blocked ? <span className="admin-chip bg-amber-500/15 text-amber-300">Blocked</span> : <span className="admin-chip bg-emerald-500/15 text-emerald-300">New</span>}
    </label>
  );
}
