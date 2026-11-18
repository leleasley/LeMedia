import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { ArrowUpCircle, CheckCircle2, HelpCircle, RefreshCw, ScrollText } from 'lucide-react';
import api from '@/lib/api';
import { GithubMark } from '@/icons/GithubMark';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { Spinner } from '@/components/Spinner';

interface Release { tag: string; name: string | null; publishedAt: string | null; url: string }
interface UpdateStatus {
  kind: 'zurg' | 'rex'; repo: string; connected: boolean; installed: string | null;
  latest: Release | null; behind: number | null; upToDate: boolean | null; error: string | null; checkedAt: string | null;
}

/** "Is there a newer Zurg / rex?" — compares the running version with the repo's newest
 *  release, read through LeMedia's GitHub connection. */
export function UpdateStatusRow({ kind }: Readonly<{ kind: 'zurg' | 'rex' }>) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<UpdateStatus | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const load = useCallback(async (fresh = false) => {
    try {
      const { data } = await api.get<{ zurg: UpdateStatus | null; rex: UpdateStatus | null }>(`/admin/updates${fresh ? '?fresh=1' : ''}`);
      setS(data[kind]);
    } catch { setS(null); }
  }, [kind]);
  useEffect(() => { void load(); }, [load]);

  const check = async () => { setChecking(true); await load(true); setChecking(false); };
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) : '');
  const name = kind === 'zurg' ? 'Zurg' : 'rex';

  if (s === undefined) {
    return <div className="admin-row"><span className="admin-icon-tile"><Spinner size="sm" /></span><span className="text-sm text-ndp-text-dim">{t('admin.updates.checking', 'Checking for updates…')}</span></div>;
  }
  if (s === null) return null;

  if (!s.connected) {
    return (
      <Link to="/admin?tab=instance#github" className="admin-row hover:bg-white/[0.03] transition-colors">
        <span className="admin-icon-tile"><GithubMark className="w-4 h-4" /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] text-ndp-text">{t('admin.updates.connect_title', 'Updates')}</span>
          <span className="block text-xs text-ndp-text-dim">{t('admin.updates.connect', 'Connect GitHub to see when a new {{name}} is out', { name })}</span>
        </span>
        <span className="text-xs font-medium text-ndp-accent whitespace-nowrap">{t('admin.updates.connect_cta', 'Connect')}</span>
      </Link>
    );
  }

  let tone = 'bg-white/[0.06] text-ndp-text';
  let icon = <HelpCircle className="w-4 h-4" />;
  let title: string;
  let sub: string;
  if (s.error) {
    title = t('admin.updates.cant_check', 'Can\'t check for updates');
    sub = s.error === 'not_visible'
      ? t('admin.updates.not_visible', 'The connected GitHub account can\'t see {{repo}}', { repo: s.repo })
      : s.error === 'token_rejected' ? t('admin.updates.token_rejected', 'GitHub rejected the token, reconnect it') : s.error;
  } else if (!s.latest) {
    title = t('admin.updates.no_releases', 'No releases found');
    sub = s.repo;
  } else if (s.upToDate) {
    tone = 'bg-emerald-500/15 text-emerald-400';
    icon = <CheckCircle2 className="w-4 h-4" />;
    title = t('admin.updates.up_to_date', 'Up to date');
    sub = `${s.latest.tag} · ${t('admin.updates.released', 'released {{date}}', { date: date(s.latest.publishedAt) })}`;
  } else if (s.installed) {
    tone = 'bg-amber-500/15 text-amber-300';
    icon = <ArrowUpCircle className="w-4 h-4" />;
    title = t('admin.updates.available', 'Update available: {{tag}}', { tag: s.latest.tag });
    sub = [s.behind ? t('admin.updates.behind', '{{n}} release(s) behind', { n: s.behind }) : null,
      t('admin.updates.running', 'running {{tag}}', { tag: s.installed }),
      t('admin.updates.released', 'released {{date}}', { date: date(s.latest.publishedAt) })].filter(Boolean).join(' · ');
  } else {
    title = t('admin.updates.latest', 'Latest: {{tag}}', { tag: s.latest.tag });
    sub = t('admin.updates.installed_unknown', 'The running version isn\'t known, so it can\'t be compared');
  }

  return (
    <div className="admin-row flex-wrap">
      <span className={clsx('admin-icon-tile', tone)}>{icon}</span>
      <div className="flex-1 min-w-[12rem]">
        <p className="text-[15px] font-medium text-ndp-text">{title}</p>
        <p className="text-xs text-ndp-text-dim mt-0.5 break-all">{sub}</p>
      </div>
      <div className="flex items-center gap-1">
        {s.latest && (
          <button type="button" onClick={() => setShowNotes(true)} className="h-9 px-3 flex items-center gap-1.5 rounded-lg text-sm text-ndp-text-muted hover:text-ndp-text hover:bg-white/5">
            <ScrollText className="w-4 h-4" />{t('admin.updates.changelog', 'Changelog')}
          </button>
        )}
        <button type="button" onClick={() => void check()} disabled={checking} aria-label={t('admin.updates.check_now', 'Check now')} title={t('admin.updates.check_now', 'Check now')} className="w-9 h-9 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5">
          <RefreshCw className={clsx('w-4 h-4', checking && 'animate-spin')} />
        </button>
      </div>
      {showNotes && <ReleaseNotesModal kind={kind} onClose={() => setShowNotes(false)} />}
    </div>
  );
}
