import { Fragment, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { clsx } from 'clsx';
import { Trash2, RefreshCw, ScrollText, ChevronDown, ChevronRight, ChevronLeft, Copy, Check, Search, Pause, Play, Eye, EyeOff } from 'lucide-react';
import { localizedDateTime } from '@/i18n/formatters';
import { copyToClipboard } from '@/utils/clipboard';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { ConfirmModal } from '@/components/ConfirmModal';
import { groupLogs, type LogEntryLike, type LogGroup } from '@/utils/groupLogs';

interface LogEntry extends LogEntryLike { }
interface Facets { labels: { label: string; count: number }[]; levels: Record<string, number> }

const LABEL_COLORS: Record<string, string> = {
  Auth: 'bg-blue-500/10 text-blue-400',
  Sync: 'bg-cyan-500/10 text-cyan-400',
  Job: 'bg-yellow-500/10 text-yellow-300',
  Settings: 'bg-slate-500/10 text-slate-400',
  Service: 'bg-orange-500/10 text-orange-400',
  User: 'bg-emerald-500/10 text-emerald-400',
  Notification: 'bg-pink-500/10 text-pink-400',
  Support: 'bg-amber-500/10 text-amber-400',
  Request: 'bg-sky-500/10 text-sky-400',
  Quality: 'bg-rose-500/10 text-rose-400',
  Media: 'bg-teal-500/10 text-teal-400',
  Test: 'bg-gray-500/10 text-gray-400',
  Setup: 'bg-lime-500/10 text-lime-400',
};

const LEVEL_COLORS: Record<string, string> = {
  info: 'bg-ndp-accent/10 text-ndp-accent',
  warn: 'bg-ndp-warning/10 text-ndp-warning',
  error: 'bg-ndp-danger/10 text-ndp-danger',
  debug: 'bg-white/[0.06] text-ndp-text-dim',
};

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t('admin.logs.just_now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('admin.logs.minutes_ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('admin.logs.hours_ago', { count: hours });
  const days = Math.floor(hours / 24);
  return t('admin.logs.days_ago', { count: days });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour12: false });
const dayKey = (iso: string) => new Date(iso).toDateString();

export function LogsTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Freetext search (debounced into `search`) + live-poll pause + clear confirm.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Routine cron lines are hidden by default; an explicit Job filter overrides this server-side.
  const [hideRoutine, setHideRoutine] = useState(() => {
    try { return localStorage.getItem('lemedia.logs.hideRoutine') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('lemedia.logs.hideRoutine', hideRoutine ? '1' : '0'); } catch { /* private mode */ }
  }, [hideRoutine]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (levelFilter) params.set('level', levelFilter);
      if (labelFilter) params.set('label', labelFilter);
      if (search) params.set('q', search);
      if (hideRoutine) params.set('hideRoutine', '1');
      const { data } = await api.get(`/admin/logs?${params}`);
      setLogs(data.results);
      setTotalPages(data.totalPages);
      setTotal(data.total ?? 0);
      if (data.facets) setFacets(data.facets);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, levelFilter, labelFilter, search, hideRoutine]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (paused) return;
    const tick = () => { if (!document.hidden) fetchLogs(); };
    const interval = setInterval(tick, 10_000);
    return () => clearInterval(interval);
  }, [fetchLogs, paused]);

  const clearLogs = async () => {
    try { await api.delete('/admin/logs'); setLogs([]); setTotal(0); setFacets(null); }
    catch (err) { console.error(err); }
  };

  // Server-provided facets keep the chips stable while paging; fall back to the current page.
  const labels = facets?.labels?.length
    ? facets.labels
    : [...new Set(logs.map((l) => l.label))].sort((a, b) => a.localeCompare(b)).map((label) => ({ label, count: 0 }));
  const levelCounts = facets?.levels ?? {};
  const allCount = Object.values(levelCounts).reduce((sum, n) => sum + n, 0);

  const groups = groupLogs(logs);

  // Icon-only action buttons share one shape: rounded-lg, 40×40 hit area, hover-bg on
  // white/5. Keeps the toolbar tight when there are a lot of labels in the filter row.
  const iconBtn = 'w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  const levelLabel = (lvl: string) => (lvl === '' ? t('common.all') : lvl === 'info' ? t('admin.logs.info', 'info') : lvl === 'warn' ? t('admin.logs.warn', 'warn') : lvl === 'error' ? t('admin.logs.error', 'error') : t('admin.logs.debug', 'debug'));

  return (
    <AdminTabLayout>
      <div className="space-y-3">
        {/* Toolbar, search takes the full first line on phones; level segments + actions
            share the second. From sm up everything sits on one line. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64 sm:order-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ndp-text-dim pointer-events-none" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('admin.logs.search_placeholder', 'Search messages...')}
              aria-label={t('admin.logs.search_placeholder', 'Search messages...')}
              className="input w-full text-sm pl-9 pr-3 py-2.5"
            />
          </div>
          <div className="inline-flex items-center rounded-lg bg-ndp-surface p-0.5 ring-1 ring-inset ring-white/[0.06] sm:order-1">
            {(['', 'info', 'warn', 'error', 'debug'] as const).map((lvl) => {
              const count = lvl === '' ? allCount : levelCounts[lvl] ?? 0;
              return (
                <button key={lvl} onClick={() => { setLevelFilter(lvl); setPage(1); }}
                  className={clsx('h-9 px-2.5 rounded-md text-xs font-medium capitalize transition-colors flex items-center gap-1',
                    levelFilter === lvl ? 'bg-ndp-surface-light text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text',
                    lvl !== '' && count === 0 && levelFilter !== lvl && 'opacity-45'
                  )}>
                  {levelLabel(lvl)}
                  {count > 0 && <span className="tabular-nums opacity-60">{count > 999 ? `${Math.floor(count / 1000)}k` : count}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center ml-auto sm:order-3">
            <button
              onClick={() => { setHideRoutine(!hideRoutine); setPage(1); }}
              aria-pressed={hideRoutine}
              title={t('admin.logs.hide_routine_hint', 'Hide the routine "Job completed" lines written every few minutes')}
              className={clsx('h-9 px-2.5 mr-1 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5',
                hideRoutine ? 'bg-ndp-surface-light text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5')}
            >
              {hideRoutine ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{t('admin.logs.routine_jobs', 'Routine jobs')}</span>
            </button>
            <button
              onClick={fetchLogs}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              className={iconBtn}
            >
              <RefreshCw className={clsx('w-4 h-4', loading && logs.length > 0 && 'animate-spin')} />
            </button>
            <button
              onClick={() => setPaused(!paused)}
              aria-label={paused ? t('admin.logs.resume', 'Resume live updates') : t('admin.logs.pause', 'Pause live updates')}
              title={paused ? t('admin.logs.resume', 'Resume live updates') : t('admin.logs.pause', 'Pause live updates')}
              className={clsx(iconBtn, !paused && 'text-ndp-success')}
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              aria-label={t('admin.logs.clear')}
              title={t('admin.logs.clear')}
              className={clsx(iconBtn, 'hover:bg-ndp-danger/10 hover:text-ndp-danger')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category chips, wrap freely, never scroll the page. Counts come from the server so
            they don't change as you page through the list. */}
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {labels.map(({ label: lbl, count }) => (
              <button key={lbl} onClick={() => { setLabelFilter(labelFilter === lbl ? '' : lbl); setPage(1); }}
                className={clsx('h-8 px-2.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5',
                  labelFilter === lbl ? (LABEL_COLORS[lbl] || 'bg-white/10 text-ndp-text') : 'bg-white/[0.04] text-ndp-text-muted hover:bg-white/[0.08] hover:text-ndp-text'
                )}>
                {lbl}
                {count > 0 && <span className="tabular-nums opacity-55">{count > 999 ? `${Math.floor(count / 1000)}k` : count}</span>}
              </button>
            ))}
            {(labelFilter || search) && (
              <button onClick={() => { setLabelFilter(''); setSearchInput(''); setSearch(''); setPage(1); }}
                className="h-8 px-2.5 rounded-lg text-xs font-medium text-ndp-accent hover:bg-ndp-accent/10 transition-colors">
                {t('admin.logs.clear_filters', 'Clear filters')}
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmClear}
        tone="danger"
        title={t('admin.logs.clear_title', 'Clear all logs?')}
        description={t('admin.logs.clear_desc', 'This permanently deletes every log entry. This cannot be undone.')}
        confirmLabel={t('admin.logs.clear_confirm', 'Clear logs')}
        onConfirm={clearLogs}
        onClose={() => setConfirmClear(false)}
      />

      <div className="mt-5">
        {loading && logs.length === 0 ? <Spinner /> : logs.length === 0 ? (
          <div className="admin-group py-14 px-4 text-center">
            <ScrollText className="w-8 h-8 text-ndp-text-dim mx-auto mb-3" />
            <p className="text-sm text-ndp-text-dim">{t('admin.logs.no_logs')}</p>
          </div>
        ) : (
          <LogList groups={groups} t={t} />
        )}
      </div>

      {(totalPages > 1 || total > 0) && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label={t('common.previous')}
            title={t('common.previous')}
            className={iconBtn}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-ndp-text-muted tabular-nums px-2 min-w-[3.5rem] text-center">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label={t('common.next')}
            title={t('common.next')}
            className={iconBtn}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-3 text-[11px] text-ndp-text-dim tabular-nums">
            {t('admin.logs.entries', '{{total}} entries', { total: total.toLocaleString() })}
          </span>
        </div>
      )}
    </AdminTabLayout>
  );
}

/** Plain list, 50 rows per page. Consecutive repeats collapse into one row with a count and the
 *  span of time they cover, which is what keeps a noisy log scannable. */
function LogList({ groups, t }: Readonly<{ groups: LogGroup[]; t: TFunction }>) {
  return (
    <div className="admin-group divide-y divide-white/[0.06]">
      {groups.map((group, i) => {
        const previousDay = i > 0 ? dayKey(groups[i - 1].log.createdAt) : null;
        const day = dayKey(group.log.createdAt);
        return (
          <Fragment key={`${group.signature}-${i}`}>
            {day !== previousDay && <DayHeading iso={group.log.createdAt} t={t} />}
            <LogRow group={group} t={t} />
          </Fragment>
        );
      })}
    </div>
  );
}

function DayHeading({ iso, t }: Readonly<{ iso: string; t: TFunction }>) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const label = date.toDateString() === today.toDateString()
    ? t('admin.logs.today', 'Today')
    : date.toDateString() === yesterday.toDateString()
      ? t('admin.logs.yesterday', 'Yesterday')
      : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  return (
    <div className="px-4 py-1.5 bg-white/[0.02]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{label}</p>
    </div>
  );
}

function LogRow({ group, t }: Readonly<{ group: LogGroup; t: TFunction }>) {
  const { log, count } = group;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [head, ...stackLines] = log.message.split('\n---\n');
  const hasStack = stackLines.length > 0;
  const stack = stackLines.join('\n---\n');

  const copy = async () => {
    const block = [
      `[${log.level.toUpperCase()}] [${log.label}] ${localizedDateTime(group.newest)}${count > 1 ? ` (×${count}, ${localizedDateTime(group.oldest)} – ${localizedDateTime(group.newest)})` : ''}`,
      head,
      hasStack ? `\n${stack}` : '',
    ].filter(Boolean).join('\n');
    const ok = await copyToClipboard(block);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const ago = timeAgo(group.newest, t);
  const span = count > 1
    ? t('admin.logs.repeat_range', '{{count}} identical · {{from}} – {{to}}', { count, from: clock(group.oldest), to: clock(group.newest) })
    : localizedDateTime(group.newest);

  return (
    <div>
      <div className="flex items-start gap-1 pl-1.5 pr-1.5">
        {hasStack ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-9 h-9 mt-1 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 flex-shrink-0"
            aria-label={expanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-9 flex-shrink-0" />
        )}
        {/* Phones: chips + time on top, message wraps underneath. sm+: timestamp column, chips,
            message, count — one scan line. */}
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 py-2">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={clsx('admin-chip uppercase', LEVEL_COLORS[log.level] || 'bg-white/10 text-ndp-text-muted')}>{log.level}</span>
            <span className={clsx('admin-chip', LABEL_COLORS[log.label] || 'bg-white/10 text-ndp-text-muted')}>{log.label}</span>
            {count > 1 && (
              <span className="admin-chip bg-white/[0.06] text-ndp-text-muted tabular-nums" title={span}>×{count}</span>
            )}
            <span className="sm:hidden text-[11px] text-ndp-text-dim ml-auto" title={span}>{ago}</span>
          </div>
          <p className="text-sm text-ndp-text flex-1 min-w-0 break-words leading-snug">{head}</p>
          <span className="hidden sm:block text-[11px] text-ndp-text-dim flex-shrink-0 pt-0.5 font-mono tabular-nums" title={span}>{clock(group.newest)}</span>
        </div>
        <button
          onClick={copy}
          className="w-9 h-9 mt-0.5 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
          title={t('admin.logs.copy', 'Copy details')}
          aria-label={t('admin.logs.copy', 'Copy details')}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-ndp-success" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      {expanded && hasStack && (
        <div className="px-4 pb-3">
          <pre className="rounded-lg bg-black/30 ring-1 ring-inset ring-white/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-ndp-text-muted overflow-x-auto whitespace-pre-wrap break-words font-mono">{stack}</pre>
        </div>
      )}
    </div>
  );
}
