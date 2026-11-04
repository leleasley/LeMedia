import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { CheckCircle2, Clock, Loader2, PauseCircle, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

interface ZurgJobView {
  state: string;
  detail: string | null;
  nextRetry: string | null;
  attempts: number | null;
  release: string | null;
  quality: string | null;
  placed: boolean;
  updatedAt: string | null;
  season: number | null;
  episodes: [number, number | null] | null;
}

function relative(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** What zurg's acquisition is doing for this title. Renders nothing when zurg isn't configured
 *  or has no job for it. Re-polls while something is still in flight. */
export function ZurgStatus({ mediaType, tmdbId }: Readonly<{ mediaType: 'movie' | 'tv'; tmdbId: number }>) {
  const { t, i18n } = useTranslation();
  const [jobs, setJobs] = useState<ZurgJobView[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const { data } = await api.get<{ jobs: ZurgJobView[] }>(`/zurg/media/${mediaType}/${tmdbId}`);
        if (cancelled) return;
        const list = Array.isArray(data?.jobs) ? data.jobs : [];
        setJobs(list);
        // Keep it live while zurg is still working on it (the watcher refreshes every 30 s).
        if (list.some((j) => j.state !== 'done' && j.state !== 'set aside')) timer = window.setTimeout(load, 30_000);
      } catch {
        if (!cancelled) setJobs([]);
      }
    };
    void load();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [mediaType, tmdbId]);

  if (jobs.length === 0) return null;

  const row = (j: ZurgJobView, i: number) => {
    const scope = j.season !== null
      ? (j.episodes && j.episodes[0] !== null
          ? t('zurg.season_eps', 'Season {{s}} · E{{a}}–{{b}}', { s: j.season, a: j.episodes[0], b: j.episodes[1] ?? j.episodes[0] })
          : t('zurg.season', 'Season {{s}}', { s: j.season }))
      : null;
    let Icon = Loader2;
    let tone = 'text-sky-300';
    let headline = t('zurg.searching', 'Zurg is searching');
    let sub: string | null = null;
    if (j.state === 'done') {
      Icon = CheckCircle2; tone = 'text-emerald-400';
      headline = t('zurg.grabbed', 'Grabbed by Zurg');
      sub = [j.release, j.quality].filter(Boolean).join(' · ') || null;
    } else if (j.state === 'retrying') {
      Icon = RefreshCw; tone = 'text-amber-300';
      headline = t('zurg.retrying', 'Zurg is retrying');
      const next = relative(j.nextRetry, i18n.language);
      sub = [j.detail, next ? t('zurg.next_try', 'next try {{when}}', { when: next }) : null].filter(Boolean).join(' · ') || null;
    } else if (j.state === 'set aside') {
      Icon = PauseCircle; tone = 'text-ndp-text-dim';
      headline = t('zurg.set_aside', 'Zurg set this aside');
      sub = j.detail;
    } else if (j.state === 'waiting' || j.state === 'queued') {
      Icon = Clock;
      headline = t('zurg.queued', 'Queued in Zurg');
    }
    return (
      <div key={`${j.season ?? 'm'}-${i}`} className="flex items-start gap-3 px-3.5 py-2.5">
        <Icon className={clsx('w-4 h-4 mt-0.5 flex-shrink-0', tone, Icon === Loader2 && 'animate-spin')} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ndp-text">
            {headline}{scope ? <span className="text-ndp-text-dim font-normal"> · {scope}</span> : null}
          </p>
          {sub && <p className="text-xs text-ndp-text-dim mt-0.5 break-words">{sub}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl bg-ndp-surface/80 ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
      {jobs.slice(0, 12).map(row)}
    </div>
  );
}
