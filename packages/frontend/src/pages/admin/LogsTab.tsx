import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { clsx } from 'clsx';
import { Trash2, RefreshCw, ScrollText, ChevronDown, ChevronRight, ChevronLeft, Copy, Check, Search, Pause, Play } from 'lucide-react';
import { localizedDateTime } from '@/i18n/formatters';
import { copyToClipboard } from '@/utils/clipboard';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { ConfirmModal } from '@/components/ConfirmModal';

interface LogEntry { id: number; level: string; label: string; message: string; createdAt: string; }

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

export function LogsTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
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
      const { data } = await api.get(`/admin/logs?${params}`);
      setLogs(data.results);
      setTotalPages(data.totalPages);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, levelFilter, labelFilter, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (paused) return;
    const tick = () => { if (!document.hidden) fetchLogs(); };
    const interval = setInterval(tick, 10_000);
    return () => clearInterval(interval);
  }, [fetchLogs, paused]);

  const clearLogs = async () => {
    try { await api.delete('/admin/logs'); setLogs([]); }
    catch (err) { console.error(err); }
  };

  const uniqueLabels = [...new Set(logs.map((l) => l.label))].sort((a, b) => a.localeCompare(b));

  // Icon-only action buttons share one shape: rounded-lg, 40×40 hit area, hover-bg on
  // white/5. Keeps the toolbar tight when there are a lot of labels in the filter row.
  const iconBtn = 'w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

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
            {['', 'info', 'warn', 'error'].map((lvl) => (
              <button key={lvl} onClick={() => { setLevelFilter(lvl); setPage(1); }}
                className={clsx('h-9 px-3 rounded-md text-xs font-medium capitalize transition-colors',
                  levelFilter === lvl ? 'bg-ndp-surface-light text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text'
                )}>
                {lvl || t('common.all')}
              </button>
            ))}
          </div>
          <div className="flex items-center ml-auto sm:order-3">
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

        {/* Category chips, wrap freely, never scroll the page. */}
        {uniqueLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {uniqueLabels.map((lbl) => (
              <button key={lbl} onClick={() => { setLabelFilter(labelFilter === lbl ? '' : lbl); setPage(1); }}
                className={clsx('h-9 px-3 rounded-lg text-xs font-medium transition-colors',
                  labelFilter === lbl ? (LABEL_COLORS[lbl] || 'bg-white/10 text-ndp-text') : 'bg-white/[0.04] text-ndp-text-muted hover:bg-white/[0.08] hover:text-ndp-text'
                )}>
                {lbl}
              </button>
            ))}
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
          <LogList logs={logs} t={t} />
        )}
      </div>

      {totalPages > 1 && (
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
        </div>
      )}
    </AdminTabLayout>
  );
}

/** Plain list — 50 rows per page, no virtualisation needed. The previous window-mode
 *  virtualizer was misaligned with the admin layout (admin scrolls inside <main>, not the
 *  window), which reserved ~3200px of placeholder height and produced a runaway scrollbar. */
function LogList({ logs, t }: Readonly<{ logs: LogEntry[]; t: TFunction }>) {
  return (
    <div className="admin-group divide-y divide-white/[0.06]">
      {logs.map((log) => <LogRow key={log.id} log={log} t={t} />)}
    </div>
  );
}

function LogRow({ log, t }: Readonly<{ log: LogEntry; t: TFunction }>) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [head, ...stackLines] = log.message.split('\n---\n');
  const hasStack = stackLines.length > 0;
  const stack = stackLines.join('\n---\n');

  const levelColors: Record<string, string> = {
    info: 'bg-ndp-accent/10 text-ndp-accent',
    warn: 'bg-ndp-warning/10 text-ndp-warning',
    error: 'bg-ndp-danger/10 text-ndp-danger',
  };

  const copy = async () => {
    const block = [
      `[${log.level.toUpperCase()}] [${log.label}] ${localizedDateTime(log.createdAt)}`,
      head,
      hasStack ? `\n${stack}` : '',
    ].filter(Boolean).join('\n');
    const ok = await copyToClipboard(block);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const time = timeAgo(log.createdAt, t);

  return (
    <div>
      <div className="flex items-start gap-1 px-1.5 py-1.5 min-h-[52px]">
        {hasStack ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 flex-shrink-0"
            aria-label={expanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-10 flex-shrink-0" />
        )}
        {/* Phones: chips + time on top, message wraps underneath. sm+: one line. */}
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 py-2.5">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={clsx('admin-chip uppercase', levelColors[log.level] || '')}>{log.level}</span>
            <span className={clsx('admin-chip', LABEL_COLORS[log.label] || 'bg-white/10 text-ndp-text-muted')}>{log.label}</span>
            <span className="sm:hidden text-[11px] text-ndp-text-dim ml-auto" title={localizedDateTime(log.createdAt)}>{time}</span>
          </div>
          <p className="text-sm text-ndp-text flex-1 min-w-0 break-words leading-snug">{head}</p>
          <span className="hidden sm:block text-xs text-ndp-text-dim flex-shrink-0 pt-px" title={localizedDateTime(log.createdAt)}>{time}</span>
        </div>
        <button
          onClick={copy}
          className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
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
