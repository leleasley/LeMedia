import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, ArrowDownToLine, Ban, CheckCircle2, Download, FileX, Loader2, PenLine, Search, Trash2, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';
import { APP_META, ago, bytes, type LibApp } from './shared';

const LIB_APPS: LibApp[] = ['sonarr', 'radarr'];

function AppFilter({ value, onChange, counts }: Readonly<{ value: LibApp | 'all'; onChange: (v: LibApp | 'all') => void; counts?: Partial<Record<LibApp | 'all', number>> }>) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['all', ...LIB_APPS] as const).map((a) => (
        <button key={a} type="button" onClick={() => onChange(a)}
          className={clsx('px-3 py-1.5 rounded-lg text-sm ring-1 ring-inset transition-colors', value === a ? 'bg-ndp-accent/15 ring-ndp-accent/40 text-ndp-text' : 'bg-ndp-surface ring-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>
          {a === 'all' ? 'All' : APP_META[a].name}{counts?.[a] !== undefined ? <span className="text-ndp-text-dim ml-1.5 tabular-nums">{counts[a]}</span> : null}
        </button>
      ))}
    </div>
  );
}

const Poster = ({ src }: { src: string | null }) => (src
  ? <img src={src} alt="" loading="lazy" className="w-9 h-[54px] rounded object-cover flex-shrink-0 bg-white/[0.05]" />
  : <span className="w-9 h-[54px] rounded bg-white/[0.05] flex-shrink-0" />);

const AppTag = ({ app }: { app: LibApp }) => <span className={clsx('admin-chip', APP_META[app].tone)}>{APP_META[app].name}</span>;

// ─── Queue ───────────────────────────────────────────────────────────

interface QueueItem {
  id: number; app: LibApp; title: string; episode: string | null; poster: string | null; release: string; quality: string | null;
  size: number; left: number; status: string; trackedState: string | null; trackedStatus: string | null; timeLeft: string | null;
  client: string | null; indexer: string | null; errorMessage: string | null; messages: string[]; protocol: string | null;
}

export function ArrQueue() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [filter, setFilter] = useState<LibApp | 'all'>('all');
  const [ask, setAsk] = useState<{ item: QueueItem; blocklist: boolean } | null>(null);

  const load = useCallback(async () => {
    const out: QueueItem[] = [];
    await Promise.all(LIB_APPS.map(async (a) => {
      try { const { data } = await api.get<{ items: QueueItem[] }>(`/admin/arr/${a}/queue`); out.push(...data.items); } catch { /* app offline */ }
    }));
    setItems(out);
  }, []);
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 10_000); return () => window.clearInterval(id); }, [load]);

  const shown = (items ?? []).filter((i) => filter === 'all' || i.app === filter);
  const problems = shown.filter((i) => i.trackedStatus === 'warning' || i.trackedStatus === 'error' || i.messages.length || i.errorMessage);

  return (
    <div className="space-y-4">
      <AppFilter value={filter} onChange={setFilter} counts={items ? { all: items.length, sonarr: items.filter((i) => i.app === 'sonarr').length, radarr: items.filter((i) => i.app === 'radarr').length } : undefined} />
      {problems.length > 0 && <p className="text-sm text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{problems.length} item{problems.length === 1 ? '' : 's'} need attention</p>}
      <div className="admin-group divide-y divide-white/[0.06]">
        {items === null && <p className="admin-row text-sm text-ndp-text-dim"><Loader2 className="w-4 h-4 animate-spin" />Loading the queues…</p>}
        {items && shown.length === 0 && <p className="admin-row text-sm text-ndp-text-dim"><CheckCircle2 className="w-4 h-4 text-emerald-400" />Nothing in the queue.</p>}
        {shown.map((i) => {
          const pct = i.size ? Math.round((1 - i.left / i.size) * 100) : 0;
          const warn = i.trackedStatus === 'warning' || i.trackedStatus === 'error' || !!i.errorMessage;
          const state = i.trackedState === 'importPending' ? 'Import pending' : i.trackedState === 'importBlocked' ? 'Import blocked' : i.trackedState === 'importing' ? 'Importing'
            : i.trackedState === 'failedPending' ? 'Failed' : i.status === 'downloading' ? 'Downloading' : i.status || 'Queued';
          return (
            <div key={`${i.app}-${i.id}`} className="admin-row items-start">
              <Poster src={i.poster} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[15px] font-medium text-ndp-text truncate">{i.title}</p>
                  <AppTag app={i.app} />
                  <span className={clsx('admin-chip', warn ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300')}>{state}</span>
                </div>
                {i.episode && <p className="text-xs text-ndp-text-muted mt-0.5 truncate">{i.episode}</p>}
                <p className="text-xs text-ndp-text-dim mt-0.5 break-all line-clamp-1" title={i.release}>{i.release}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden"><span className={clsx('block h-full', warn ? 'bg-amber-400' : 'bg-sky-400')} style={{ width: `${pct}%` }} /></span>
                  <span className="text-xs text-ndp-text-dim tabular-nums whitespace-nowrap">{pct}% of {bytes(i.size)}{i.timeLeft && i.left ? ` · ${i.timeLeft} left` : ''}</span>
                </div>
                <p className="text-xs text-ndp-text-dim mt-1">{[i.quality, i.client, i.indexer].filter(Boolean).join(' · ')}</p>
                {[i.errorMessage, ...i.messages].filter(Boolean).map((m, n) => <p key={n} className="text-xs text-amber-300/90 mt-1">{m}</p>)}
              </div>
              <div className="flex flex-col gap-1.5">
                <button type="button" title="Remove" aria-label="Remove" className="p-2 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/[0.05]" onClick={() => setAsk({ item: i, blocklist: false })}><Trash2 className="w-4 h-4" /></button>
                <button type="button" title="Remove and blocklist the release" aria-label="Remove and blocklist" className="p-2 rounded-lg text-ndp-text-dim hover:text-red-300 hover:bg-white/[0.05]" onClick={() => setAsk({ item: i, blocklist: true })}><Ban className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
      <ConfirmModal open={!!ask} tone="danger" confirmLabel={ask?.blocklist ? 'Remove and blocklist' : 'Remove'}
        title={`Remove ${ask?.item.title ?? ''} from the queue?`}
        description={ask?.blocklist ? 'The download is removed and this exact release is blocklisted, so the next search picks a different one.' : 'The download is removed from the download client. The title stays monitored.'}
        onClose={() => setAsk(null)}
        onConfirm={async () => {
          if (!ask) return;
          try { await api.delete(`/admin/arr/${ask.item.app}/queue/${ask.item.id}${ask.blocklist ? '?blocklist=1' : ''}`); showToast('Removed from the queue', 'success'); await load(); }
          catch (err) { toastApiError(err, 'Could not remove it'); }
        }} />
    </div>
  );
}

// ─── Activity ────────────────────────────────────────────────────────

interface ActivityItem { id: string; app: LibApp; kind: string; title: string; episode: string | null; poster: string | null; release: string; quality: string | null; date: string; detail: string | null }

const KIND: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  grabbed: { label: 'Grabbed', icon: ArrowDownToLine, tone: 'bg-sky-500/15 text-sky-300' },
  imported: { label: 'Imported', icon: Download, tone: 'bg-emerald-500/15 text-emerald-400' },
  failed: { label: 'Failed', icon: XCircle, tone: 'bg-red-500/15 text-red-400' },
  deleted: { label: 'Deleted', icon: FileX, tone: 'bg-white/[0.08] text-ndp-text-muted' },
  renamed: { label: 'Renamed', icon: PenLine, tone: 'bg-white/[0.08] text-ndp-text-muted' },
  ignored: { label: 'Ignored', icon: Ban, tone: 'bg-white/[0.08] text-ndp-text-muted' },
};

export function ArrActivity() {
  const [filter, setFilter] = useState<LibApp | 'all'>('all');
  const [kind, setKind] = useState<string>('all');
  const [data, setData] = useState<Record<LibApp, { items: ActivityItem[]; total: number; page: number }> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    const out = {} as Record<LibApp, { items: ActivityItem[]; total: number; page: number }>;
    await Promise.all(LIB_APPS.map(async (a) => {
      try { const { data: d } = await api.get<{ items: ActivityItem[]; total: number }>(`/admin/arr/${a}/activity`); out[a] = { ...d, page: 1 }; }
      catch { out[a] = { items: [], total: 0, page: 1 }; }
    }));
    setData(out);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const more = async () => {
    if (!data) return;
    setLoadingMore(true);
    const next = { ...data };
    await Promise.all(LIB_APPS.filter((a) => filter === 'all' || filter === a).map(async (a) => {
      try {
        const { data: d } = await api.get<{ items: ActivityItem[] }>(`/admin/arr/${a}/activity?page=${data[a].page + 1}`);
        next[a] = { ...next[a], items: [...next[a].items, ...d.items], page: data[a].page + 1 };
      } catch { /* keep */ }
    }));
    setData(next); setLoadingMore(false);
  };

  const all = useMemo(() => (data ? LIB_APPS.flatMap((a) => (filter === 'all' || filter === a ? data[a].items : [])) : [])
    .filter((i) => kind === 'all' || i.kind === kind)
    .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime()), [data, filter, kind]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <AppFilter value={filter} onChange={setFilter} />
        <select className="input !py-1.5 w-40 text-sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Event type">
          <option value="all">Every event</option>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="admin-group divide-y divide-white/[0.06]">
        {!data && <p className="admin-row text-sm text-ndp-text-dim"><Loader2 className="w-4 h-4 animate-spin" />Loading activity…</p>}
        {data && all.length === 0 && <p className="admin-row text-sm text-ndp-text-dim">No activity.</p>}
        {all.map((i) => {
          const k = KIND[i.kind] ?? { label: i.kind, icon: CheckCircle2, tone: 'bg-white/[0.08] text-ndp-text-muted' };
          const Icon = k.icon;
          return (
            <div key={i.id} className="admin-row items-start !py-2.5">
              <span className={clsx('admin-icon-tile mt-0.5', k.tone)}><Icon className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ndp-text truncate"><span className="font-medium">{i.title}</span>{i.episode && <span className="text-ndp-text-muted"> · {i.episode}</span>}</p>
                <p className="text-xs text-ndp-text-dim truncate" title={i.release}>{[k.label, i.quality, i.release].filter(Boolean).join(' · ')}</p>
                {i.kind === 'failed' && i.detail && <p className="text-xs text-red-300/90 mt-0.5">{i.detail}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <AppTag app={i.app} />
                <p className="text-[11px] text-ndp-text-dim mt-1 whitespace-nowrap" title={new Date(i.date).toLocaleString()}>{ago(i.date)}</p>
              </div>
            </div>
          );
        })}
        {data && all.length > 0 && (
          <button type="button" className="admin-row w-full justify-center text-sm text-ndp-accent hover:bg-white/[0.03]" disabled={loadingMore} onClick={() => void more()}>
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load older'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Wanted ──────────────────────────────────────────────────────────

interface WantedItem { id: number; app: LibApp; title: string; episode: string | null; poster: string | null; date: string | null; year?: number }

export function ArrWanted() {
  const [app, setApp] = useState<LibApp>('radarr');
  const [items, setItems] = useState<WantedItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState<Set<number>>(new Set());
  const [askAll, setAskAll] = useState(false);

  const load = useCallback(async (p = 1) => {
    try {
      const { data } = await api.get<{ items: WantedItem[]; total: number }>(`/admin/arr/${app}/wanted?page=${p}`);
      setItems((prev) => (p === 1 ? data.items : [...(prev ?? []), ...data.items])); setTotal(data.total); setPage(p);
    } catch (err) { toastApiError(err, 'Could not load the wanted list'); setItems([]); }
  }, [app]);
  useEffect(() => { setItems(null); void load(1); }, [load]);

  const search = async (ids: number[] | 'all') => {
    try {
      await api.post(`/admin/arr/${app}/search`, ids === 'all' ? { all: true } : { ids });
      if (ids !== 'all') setSearching((s) => new Set([...s, ...ids]));
      showToast(ids === 'all' ? `${APP_META[app].name} is searching for everything missing` : 'Search started', 'success');
    } catch (err) { toastApiError(err, 'Could not start the search'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {LIB_APPS.map((a) => (
          <button key={a} type="button" onClick={() => setApp(a)}
            className={clsx('px-3 py-1.5 rounded-lg text-sm ring-1 ring-inset', app === a ? 'bg-ndp-accent/15 ring-ndp-accent/40 text-ndp-text' : 'bg-ndp-surface ring-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>
            {APP_META[a].name}
          </button>
        ))}
        <span className="text-sm text-ndp-text-dim ml-1">{items ? `${total} missing and monitored` : ''}</span>
        <button type="button" className="btn-secondary !py-1.5 text-sm inline-flex items-center gap-1.5 ml-auto" disabled={!total} onClick={() => setAskAll(true)}><Search className="w-3.5 h-3.5" />Search all</button>
      </div>
      <div className="admin-group divide-y divide-white/[0.06]">
        {items === null && <p className="admin-row text-sm text-ndp-text-dim"><Loader2 className="w-4 h-4 animate-spin" />Loading…</p>}
        {items && items.length === 0 && <p className="admin-row text-sm text-ndp-text-dim"><CheckCircle2 className="w-4 h-4 text-emerald-400" />Nothing missing.</p>}
        {items?.map((i) => (
          <div key={`${i.app}-${i.id}`} className="admin-row !py-2">
            <Poster src={i.poster} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ndp-text truncate">{i.title}{i.year ? <span className="text-ndp-text-dim font-normal"> ({i.year})</span> : null}</p>
              {i.episode && <p className="text-xs text-ndp-text-muted truncate">{i.episode}</p>}
              {i.date && <p className="text-xs text-ndp-text-dim">{app === 'sonarr' ? 'Aired' : 'Released'} {new Date(i.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
            </div>
            <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5" disabled={searching.has(i.id)} onClick={() => void search([i.id])}>
              <Search className="w-3.5 h-3.5" />{searching.has(i.id) ? 'Searching' : 'Search'}
            </button>
          </div>
        ))}
        {items && items.length < total && (
          <button type="button" className="admin-row w-full justify-center text-sm text-ndp-accent hover:bg-white/[0.03]" onClick={() => void load(page + 1)}>Show more ({total - items.length} left)</button>
        )}
      </div>
      <ConfirmModal open={askAll} title={`Search for all ${total} missing in ${APP_META[app].name}?`} confirmLabel="Search all"
        description="Runs the app's own 'search all missing'. With many titles this sends a lot of queries to your indexers."
        onClose={() => setAskAll(false)} onConfirm={() => search('all')} />
    </div>
  );
}
