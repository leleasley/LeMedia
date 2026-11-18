import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { ExternalLink, X } from 'lucide-react';
import api from '@/lib/api';
import ReleaseNoteBody from '@/components/ReleaseNoteBody';
import { Spinner } from '@/components/Spinner';

interface Release { tag: string; name: string | null; publishedAt: string | null; url: string; prerelease: boolean; body: string | null }
interface Notes { repo: string; connected: boolean; installed: string | null; error: string | null; releases: Release[] }

/** GitHub release bodies use more Markdown than the note reader understands. Fold it into the
 *  constructs it does read (headings, bullets, bold, code); links keep their text, HTML and
 *  comments are dropped. The reader renders text only, so nothing from GitHub is ever injected. */
function normalise(body: string): string {
  return body
    .replace(/\r/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '## ')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')
    .replace(/__([^_]+)__/g, '**$1**')
    // Headings are shown as plain text, so drop their inline-code backticks.
    .replace(/^## .*$/gm, (line) => line.replace(/`/g, ''))
    .trim();
}

/** Latest Zurg / rex release, with its notes and running-version marker. */
export function ReleaseNotesModal({ kind, onClose }: Readonly<{ kind: 'zurg' | 'rex'; onClose: () => void }>) {
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState<Notes | null>(null);
  const [failed, setFailed] = useState(false);
  const name = kind === 'zurg' ? 'Zurg' : 'rex';

  useEffect(() => {
    api.get<Notes>(`/admin/updates/${kind}/releases`).then(({ data }) => setNotes(data)).catch(() => setFailed(true));
  }, [kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const installedAt = notes?.installed ? notes.releases.findIndex((r) => r.tag === notes.installed) : -1;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  return (
    <div className="modal-overlay z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="release-notes-title"
        className="modal-panel w-full max-w-2xl min-w-0 flex flex-col p-0" style={{ overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2 id="release-notes-title" className="text-lg font-semibold text-ndp-text">{t('admin.updates.changelog_title', '{{name}} changelog', { name })}</h2>
            <p className="text-xs text-ndp-text-dim mt-0.5 break-all">
              {notes?.repo}{notes?.installed ? ` · ${t('admin.updates.running', 'running {{tag}}', { tag: notes.installed })}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} className="w-9 h-9 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5 space-y-8">
          {!notes && !failed && (
            <p className="flex items-center gap-2 text-sm text-ndp-text-dim" role="status"><Spinner size="sm" />{t('common.loading', 'Loading…')}</p>
          )}
          {failed && <p className="text-sm text-ndp-danger" role="alert">{t('admin.updates.changelog_failed', 'Could not load the releases')}</p>}
          {notes && !notes.connected && <p className="text-sm text-ndp-text-muted">{t('admin.updates.connect', 'Connect GitHub to see when a new {{name}} is out', { name })}</p>}
          {notes?.error && <p className="text-sm text-ndp-danger" role="alert">{notes.error === 'not_visible' ? t('admin.updates.not_visible', 'The connected GitHub account can\'t see {{repo}}', { repo: notes.repo }) : notes.error}</p>}
          {notes?.connected && !notes.error && notes.releases.length === 0 && <p className="text-sm text-ndp-text-muted">{t('admin.updates.no_releases', 'No releases found')}</p>}

          {notes?.releases.slice(0, 1).map((r, i) => {
            const running = r.tag === notes.installed;
            const isNew = installedAt > 0 && i < installedAt;
            const body = r.body ? normalise(r.body) : '';
            return (
              <section key={r.tag} aria-labelledby={`rel-${i}`}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 id={`rel-${i}`} className="text-[15px] font-semibold text-ndp-text break-all">{r.name && r.name !== r.tag ? r.name : r.tag}</h3>
                  {running && <span className="admin-chip bg-emerald-500/15 text-emerald-400">{t('admin.updates.chip_running', 'Running')}</span>}
                  {isNew && <span className="admin-chip bg-amber-500/15 text-amber-300">{t('admin.updates.chip_new', 'New')}</span>}
                  {r.prerelease && <span className="admin-chip">{t('admin.updates.chip_pre', 'Pre-release')}</span>}
                  <span className="text-xs text-ndp-text-dim">{[r.name && r.name !== r.tag ? r.tag : null, date(r.publishedAt)].filter(Boolean).join(' · ')}</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={t('admin.updates.release_notes', 'Release on GitHub')} title={t('admin.updates.release_notes', 'Release on GitHub')}
                    className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <div className={clsx('pl-0', running && 'opacity-90')}>
                  {body
                    ? <ReleaseNoteBody body={body} wrapLongLines />
                    : <p className="text-[13px] text-ndp-text-dim italic">{t('admin.updates.no_notes', 'No notes for this release')}</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
