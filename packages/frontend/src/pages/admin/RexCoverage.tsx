import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

type Show = { key: string; title: string; year: number | null; library: string };
type Coverage = { verified: boolean; reason?: string; tmdbId?: number; imdbId?: string | null; status?: string; genres?: string[]; present?: number; aired?: number; missing?: { season: number; episode: number; title: string; airDate: string }[]; unknownDates?: number };

const PAGE_SIZE = 25;

export function RexCoverage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [results, setResults] = useState<Record<string, Coverage>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('title');
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ snapshot: { shows: Show[]; results: Record<string, Coverage>; finishedAt: string } | null; progress: { running: boolean; done: number; total: number; error: string | null } }>('/admin/rex/coverage');
      setRunning(data.progress.running); setProgress(data.progress);
      setShows(data.snapshot?.shows ?? []); setResults(data.snapshot?.results ?? {}); setFinishedAt(data.snapshot?.finishedAt ?? null);
      setError(data.progress.error || '');
    } catch { setError('Could not load REX coverage results.'); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  async function refresh() {
    setError('');
    try {
      await api.post('/admin/jobs/rex_coverage/run');
      setRunning(true);
      await load();
    } catch { setError('Could not start the REX coverage check. Check the scheduled task and try again.'); }
  }
  const visible = useMemo(() => shows.filter(s => {
    const r = results[s.key];
    const match = `${s.title} ${s.library} ${(r?.genres ?? []).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase());
    return match && (filter === 'all' || (filter === 'missing' && !!r?.missing?.length) || (filter === 'complete' && r?.verified && r.missing?.length === 0) || (filter === 'unknown' && !!r && !r.verified) || (filter === 'pending' && !r));
  }).sort((a, b) => sort === 'missing' ? (results[b.key]?.missing?.length ?? -1) - (results[a.key]?.missing?.length ?? -1) || a.title.localeCompare(b.title) : a.title.localeCompare(b.title)), [shows, results, query, filter, sort]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageShows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <section>
    <div className="flex items-center justify-between gap-3 flex-wrap"><h3 className="admin-group-label">TV episode coverage</h3><button className="btn-primary px-4 py-2 text-sm" disabled={running} onClick={() => void refresh()}>{running ? `Checking ${progress.done} / ${progress.total || '…'}` : 'Refresh library'}</button></div>
    <p className="admin-hint">Compares REX TV libraries with aired TMDB episodes using LeMedia’s TMDB configuration. Specials, future episodes and episodes without an air date are excluded.</p>
    <p className="admin-hint">{running ? 'The check is running on the server. You can leave this page.' : finishedAt ? `Last checked ${new Date(finishedAt).toLocaleString()}. Scheduled in Tasks.` : 'No completed check yet. Start one here or from Tasks.'}</p>
    {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    <div className="grid grid-cols-2 gap-2 my-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <input className="input col-span-2 w-full sm:col-span-1" aria-label="Search shows" placeholder="Search shows, genres or libraries" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
      <select className="input min-w-0 w-full" aria-label="Filter coverage" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">All coverage</option><option value="missing">Missing episodes</option><option value="complete">Complete</option><option value="unknown">Not verified</option><option value="pending">Waiting to check</option></select>
      <select className="input min-w-0 w-full" aria-label="Sort shows" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="title">Sort by title</option><option value="missing">Most missing</option></select>
    </div>
    {!shows.length && !running && !error && <p className="text-sm text-ndp-text-dim">Select Refresh library to start a background check.</p>}
    {shows.length > 0 && <>
      <p className="text-xs text-ndp-text-dim mb-2" aria-live="polite">{visible.length.toLocaleString()} of {shows.length.toLocaleString()} shows · {Object.values(results).filter(r => r.verified && r.missing?.length).length.toLocaleString()} with missing episodes</p>
      {visible.length === 0 ? <p className="admin-group p-4 text-sm text-ndp-text-dim">No shows match these filters.</p> : <div className="admin-group divide-y divide-white/10">{pageShows.map(s => <ShowCard key={`${s.library}-${s.key}`} show={s} result={results[s.key]} expanded={expanded === s.key} toggle={() => setExpanded(expanded === s.key ? null : s.key)} />)}</div>}
      {pageCount > 1 && <div className="flex items-center justify-between gap-3 mt-3"><button type="button" className="btn-secondary px-4 py-2 text-sm disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="text-sm text-ndp-text-dim">Page {currentPage} of {pageCount}</span><button type="button" className="btn-secondary px-4 py-2 text-sm disabled:opacity-40" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    </>}

  </section>;
}
function ShowCard({ show, result: r, expanded, toggle }: { show: Show; result?: Coverage; expanded: boolean; toggle: () => void }) {
  const missing = r?.missing?.length ?? 0;
  return <article className="p-3 sm:p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-ndp-text break-words">{show.title}{show.year ? ` (${show.year})` : ''}</p><p className="text-xs text-ndp-text-dim mt-1">{show.library}{r?.status ? ` · ${r.status}` : ''}{r?.genres?.length ? ` · ${r.genres.join(', ')}` : ''}</p></div>
      <span className={`shrink-0 text-xs font-medium rounded-full px-2 py-1 ${!r || !r.verified ? 'bg-white/5 text-ndp-text-dim' : missing ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{!r ? 'Checking…' : !r.verified ? 'Unverified' : missing ? `${missing} missing` : 'Complete'}</span></div>
    {r?.verified && <p className="text-xs text-ndp-text-dim mt-2">{r.present} in REX · {r.aired} aired{r.unknownDates ? ` · ${r.unknownDates} without air dates` : ''}</p>}
    {r && !r.verified && <p className="text-xs text-ndp-text-dim mt-2">{r.reason || 'Unable to verify this show.'}</p>}
    {(missing > 0 || r?.tmdbId || r?.imdbId) && <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">{missing > 0 && <button type="button" className="text-red-400 underline py-1" aria-expanded={expanded} onClick={toggle}>{expanded ? 'Hide episodes' : 'Show missing episodes'}</button>}{r?.imdbId && <a className="text-ndp-accent py-1" target="_blank" rel="noopener noreferrer" href={`https://debridmediamanager.com/show/${encodeURIComponent(r.imdbId)}`}>Open DMM ↗</a>}{r?.tmdbId && <a className="text-ndp-accent py-1" target="_blank" rel="noopener noreferrer" href={`https://www.themoviedb.org/tv/${r.tmdbId}`}>Open TMDB ↗</a>}</div>}
    {expanded && <div className="mt-3 max-h-72 overflow-y-auto rounded-lg bg-black/20 p-3 text-sm text-ndp-text-dim space-y-2">{r?.missing?.map(e => <div key={`${e.season}-${e.episode}`}><span className="font-medium text-ndp-text">S{String(e.season).padStart(2, '0')}E{String(e.episode).padStart(2, '0')}</span> · {e.title} <span className="text-xs">({e.airDate})</span></div>)}</div>}
  </article>;
}
