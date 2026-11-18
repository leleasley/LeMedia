import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Copy, Pause, Play, Search } from 'lucide-react';
import api from '@/lib/api';
import { showToast, toastApiError } from '@/utils/toast';
import { Spinner } from '@/components/Spinner';

type Level = 'error' | 'warn' | 'info' | 'debug';
interface Line { time: string; level: Level; text: string }

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const DOCKER_TS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?Z\s+/;

function parse(raw: string): Line {
  let text = raw.replace(ANSI, '');
  let time = '';
  const m = DOCKER_TS.exec(text);
  if (m) { time = m[1]; text = text.slice(m[0].length); }
  // zurg repeats its own timestamp after docker's: "2026-10-29T15:34:16.367Z\tDEBUG\trepair\t..."
  const z = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?Z\t/.exec(text);
  if (z) { time = time || z[1]; text = text.slice(z[0].length); }
  // *arr files: "2026-10-29 16:06:11.7|Info|RssSyncService|..."
  const f = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\.\d+\|/.exec(text);
  if (f) { time = time || f[1].replace(' ', 'T'); text = text.slice(f[0].length).replaceAll('|', '  '); }
  const probe = text.slice(0, 40).toLowerCase();
  const level: Level = /\b(error|fatal)\b|\[(error|fatal)\]/.test(probe) ? 'error'
    : /\bwarn(ing)?\b|\[warn\]/.test(probe) ? 'warn'
    : /\b(debug|trace)\b|\[(debug|trace)\]/.test(probe) ? 'debug' : 'info';
  return { time, level, text: text.replaceAll('\t', '  ') };
}

const TONE: Record<Level, string> = { error: 'text-red-300', warn: 'text-amber-300', info: 'text-ndp-text', debug: 'text-ndp-text-dim' };

/** A live tail of one app's log (container log through the host helper, or the app's own). */
export function LogConsole({ app, height = 'h-[60vh]' }: Readonly<{ app: string; height?: string }>) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [source, setSource] = useState('');
  const [live, setLive] = useState(true);
  const [count, setCount] = useState(300);
  const [query, setQuery] = useState('');
  const [hideDebug, setHideDebug] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const failed = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ source: string; lines: string[] }>(`/admin/arr/${app}/logs?lines=${count}`);
      setLines(data.lines.map(parse));
      setSource(data.source);
      failed.current = false;
    } catch (err) {
      if (!failed.current) toastApiError(err, 'Could not read the log');
      failed.current = true;
      setLines((l) => l ?? []);
    }
  }, [app, count]);

  useEffect(() => { setLines(null); void load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [live, load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (lines ?? []).filter((l) => (!hideDebug || l.level !== 'debug') && (!q || l.text.toLowerCase().includes(q)));
  }, [lines, query, hideDebug]);

  // Follow the end unless the reader scrolled up.
  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [shown]);

  const errors = (lines ?? []).filter((l) => l.level === 'error').length;
  const warns = (lines ?? []).filter((l) => l.level === 'warn').length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ndp-text-dim" />
          <input className="input !py-2 w-full !pl-9 text-sm" placeholder="Filter lines" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input !py-2 w-28 text-sm" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Lines">
          {[300, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} lines</option>)}
        </select>
        <button type="button" onClick={() => setHideDebug(!hideDebug)} className={clsx('btn-secondary !py-2 text-sm', hideDebug && '!bg-ndp-accent/15 !text-ndp-text')}>Hide debug</button>
        <button type="button" onClick={() => setLive(!live)} className="btn-secondary !py-2 text-sm inline-flex items-center gap-1.5">
          {live ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Live</>}
        </button>
        <button type="button" aria-label="Copy" className="btn-secondary !py-2 !px-3" onClick={() => { void navigator.clipboard?.writeText(shown.map((l) => `${l.time} ${l.text}`).join('\n')); showToast('Copied', 'success'); }}><Copy className="w-4 h-4" /></button>
      </div>
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className={clsx('rounded-xl bg-black/60 ring-1 ring-inset ring-white/[0.06] overflow-auto font-mono text-[12px] leading-[1.55] p-3', height)}>
        {lines === null ? <p className="text-ndp-text-dim flex items-center gap-2"><Spinner size="sm" />Reading the log…</p>
          : shown.length === 0 ? <p className="text-ndp-text-dim">{lines.length ? 'No lines match.' : 'The log is empty.'}</p>
          : shown.map((l, i) => (
            <div key={i} className={clsx('whitespace-pre-wrap break-all flex gap-3', TONE[l.level], l.level === 'error' && 'bg-red-500/[0.06]')}>
              {l.time && <span className="text-ndp-text-dim/70 flex-shrink-0 select-none">{l.time.slice(5, 10).replace('-', '/')} {l.time.slice(11, 19)}</span>}
              <span className="min-w-0">{l.text}</span>
            </div>
          ))}
      </div>
      <p className="admin-hint !mt-1">
        {source === 'container' ? 'Container log, read through the host helper.' : source === 'app' ? 'The app\'s own log file (set up the host helper for the full container log).' : source === 'zurg' ? 'Zurg\'s own log page.' : ''}
        {lines?.length ? ` ${errors} error${errors === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'} in the last ${lines.length} lines.` : ''}
        {live ? ' Refreshes every 5 seconds.' : ''}
      </p>
    </div>
  );
}
