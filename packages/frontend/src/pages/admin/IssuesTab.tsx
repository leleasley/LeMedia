import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { CheckCircle2, Loader2, MessageSquareWarning, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { posterUrl } from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { AdminTabLayout } from './AdminTabLayout';
import { Spinner } from '@/components/Spinner';

interface Issue {
  id: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  category: string;
  message: string;
  status: 'open' | 'resolved';
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  user: { id: number; displayName: string | null; avatar: string | null } | null;
  resolvedBy: { displayName: string | null } | null;
  media: { posterPath: string | null; statusCategory: string } | null;
}

type Filter = 'open' | 'resolved' | 'all';

const CATEGORY_LABEL: Record<string, string> = {
  playback: 'Playback', wrong_file: 'Wrong file', audio: 'Audio', subtitles: 'Subtitles', other: 'Other',
};

/** Admin → Issues: what users report about titles they already have. */
export function IssuesTab() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('open');
  const [items, setItems] = useState<Issue[] | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: Issue[]; openCount: number }>(`/admin/issues?status=${filter}`);
      setItems(data.items);
      setOpenCount(data.openCount);
    } catch (err) {
      toastApiError(err, t('admin.issues.load_failed', 'Could not load issues'));
      setItems([]);
    }
  }, [filter, t]);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: number, action: 'resolve' | 'reopen' | 'delete') => {
    setBusy(id);
    try {
      if (action === 'delete') await api.delete(`/admin/issues/${id}`);
      else await api.put(`/admin/issues/${id}/${action}`);
      await load();
    } catch (err) {
      toastApiError(err, t('admin.issues.action_failed', 'That did not work'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminTabLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['open', 'resolved', 'all'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm ring-1 ring-inset transition-colors',
                filter === f ? 'bg-ndp-accent/15 ring-ndp-accent/40 text-ndp-text' : 'bg-ndp-surface ring-white/[0.06] text-ndp-text-muted hover:text-ndp-text')}>
              {f === 'open' ? t('admin.issues.open', 'Open') : f === 'resolved' ? t('admin.issues.resolved', 'Resolved') : t('common.all', 'All')}
              {f === 'open' && openCount > 0 && <span className="ml-1.5 tabular-nums text-ndp-text-dim">{openCount}</span>}
            </button>
          ))}
        </div>

        <p className="admin-hint">
          {t('admin.issues.hint', 'Reports users send from a title page. Nothing here changes the library — resolve one once you have fixed the file, subtitles or audio in Radarr/Sonarr or the media server.')}
        </p>

        <div className="admin-group divide-y divide-white/[0.06]">
          {items === null && (
            <div className="admin-row text-sm text-ndp-text-dim"><Spinner size="sm" />{t('admin.issues.loading', 'Loading issues…')}</div>
          )}
          {items && items.length === 0 && (
            <div className="admin-row text-sm text-ndp-text-dim">
              <MessageSquareWarning className="w-4 h-4" />
              {filter === 'open' ? t('admin.issues.none_open', 'No open issues.') : t('admin.issues.none', 'Nothing here yet.')}
            </div>
          )}
          {(items ?? []).map((issue) => (
            <div key={issue.id} className="admin-row items-start">
              {issue.media?.posterPath
                ? <img src={posterUrl(issue.media.posterPath, 'w92')} alt="" loading="lazy" className="w-10 h-[60px] rounded object-cover flex-shrink-0 bg-white/[0.05]" />
                : <span className="w-10 h-[60px] rounded bg-white/[0.05] flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link to={`/${issue.mediaType}/${issue.tmdbId}`} className="text-sm font-semibold text-ndp-text hover:text-ndp-accent truncate">{issue.title}</Link>
                  <span className="admin-chip bg-ndp-warning/15 text-ndp-warning">{t(`issue.category.${issue.category}`, CATEGORY_LABEL[issue.category] ?? 'Other')}</span>
                  {issue.status === 'resolved' && <span className="admin-chip bg-emerald-500/15 text-emerald-300">{t('admin.issues.resolved', 'Resolved')}</span>}
                </div>
                <p className="text-sm text-ndp-text-muted mt-1.5 whitespace-pre-wrap break-words">{issue.message}</p>
                <p className="text-[11px] text-ndp-text-dim mt-1.5">
                  {[issue.user?.displayName ?? t('admin.issues.unknown_user', 'A user'), new Date(issue.createdAt).toLocaleString(),
                    issue.status === 'resolved' && issue.resolvedBy?.displayName ? t('admin.issues.resolved_by', 'resolved by {{name}}', { name: issue.resolvedBy.displayName }) : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {issue.adminNote && <p className="text-xs text-ndp-text-dim mt-1 italic">{issue.adminNote}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {issue.status === 'open' ? (
                  <button type="button" onClick={() => void act(issue.id, 'resolve')} disabled={busy === issue.id}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                    title={t('admin.issues.resolve', 'Mark resolved')} aria-label={t('admin.issues.resolve', 'Mark resolved')}>
                    {busy === issue.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  </button>
                ) : (
                  <button type="button" onClick={() => void act(issue.id, 'reopen')} disabled={busy === issue.id}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors disabled:opacity-40"
                    title={t('admin.issues.reopen', 'Reopen')} aria-label={t('admin.issues.reopen', 'Reopen')}>
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => void act(issue.id, 'delete')} disabled={busy === issue.id}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors disabled:opacity-40"
                  title={t('common.delete', 'Delete')} aria-label={t('common.delete', 'Delete')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminTabLayout>
  );
}
