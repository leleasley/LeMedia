import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { CheckCircle2, CreditCard, Download, HardDrive, Library, Loader2, Play, RefreshCw, RotateCw, Server, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { AdminTabLayout } from './AdminTabLayout';
import { UpdateStatusRow } from './UpdateStatusRow';
import { ZurgUpdateRow } from './zurg/ZurgUpdateRow';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';

interface JobView {
  source: string; item: string; state: string; detail: string | null; nextRetry: string | null;
  attempts: number | null; release: string | null; quality: string | null; updatedAt: string | null;
}

interface Overview {
  configured: boolean;
  serviceName?: string;
  reachable?: boolean;
  fetchedAt?: string | null;
  error?: string | null;
  acquisition?: {
    started: boolean | null;
    sources: { id: string; name: string; type: string | null }[];
    counts: Record<string, number>;
    total: number;
    recentGrabs: JobView[];
    retrying: JobView[];
    inFlight: JobView[];
  };
  mount?: { state: string | null; enabled: boolean | null; lastStart: string | null } | null;
  activeStreams?: number | null;
  builtAt?: string | null;
  providers?: { type: string | null; name: string | null }[] | null;
  accounts?: { provider: string | null; plan: string | null; type: string | null; expiresAt: string | null; premiumSecondsLeft: number | null }[];
  library?: { size: number | null; directories: Record<string, number> | null; streamedBytes: number | null; uptime: string | null; version: string | null; repairQueue: number | null } | null;
  downloads?: { name: string; progress: number; state: string; sizeBytes: number; etaSec: number | null; category: string | null }[] | null;
}

const when = (iso: string | null, lang: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function ZurgTab() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<'sync' | 'restart' | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Overview>('/admin/zurg/overview');
      setData(data);
    } catch (err) {
      toastApiError(err, t('admin.zurg.load_failed', 'Could not load Zurg status'));
      // Restart in progress: look again in 5 s rather than waiting for the 30 s refresh.
      if ((err as { response?: { status?: number } })?.response?.status === 503) window.setTimeout(() => void load(), 5000);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const syncNow = async () => {
    setBusy('sync');
    try {
      const { data: r } = await api.post<{ promoted: number; checked: number }>('/admin/zurg/sync');
      showToast(t('admin.zurg.synced', 'Checked Zurg, {{n}} title(s) marked available', { n: r.promoted ?? 0 }), 'success');
      await load();
    } catch (err) {
      toastApiError(err, t('admin.zurg.sync_failed', 'Check failed'));
    } finally { setBusy(null); }
  };

  const restartMount = async () => {
    setBusy('restart');
    try {
      await api.post('/admin/zurg/rclone/restart');
      showToast(t('admin.zurg.restarted', 'Mount restart requested'), 'success');
      window.setTimeout(load, 4000);
    } catch (err) {
      toastApiError(err, t('admin.zurg.restart_failed', 'Mount restart failed'));
    } finally { setBusy(null); }
  };

  if (!data) {
    return <AdminTabLayout><div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ndp-text-dim" /></div></AdminTabLayout>;
  }

  if (!data.configured) {
    return (
      <AdminTabLayout>
        <div className="admin-group">
          <div className="admin-row items-start">
            <span className="admin-icon-tile"><Server className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-ndp-text">{t('admin.zurg.not_configured', 'Zurg isn\'t connected')}</p>
              <p className="text-sm text-ndp-text-dim mt-1">{t('admin.zurg.not_configured_hint', 'Add it under Services (type “Zurg”) with its address. LeMedia then marks titles available the moment Zurg has placed them.')}</p>
              <Link to="/admin?tab=services" className="btn-primary inline-flex mt-3 !px-4 !py-2 !text-sm">{t('admin.zurg.add_service', 'Open Services')}</Link>
            </div>
          </div>
        </div>
      </AdminTabLayout>
    );
  }

  const acq = data.acquisition;
  const counts = acq?.counts ?? {};
  const stat = (label: string, value: number | string, tone = 'text-ndp-text') => (
    <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{label}</p>
      <p className={clsx('font-display text-3xl leading-none mt-1.5', tone)}>{value}</p>
    </div>
  );
  const mountOk = data.mount?.state === 'running';

  const jobRow = (j: JobView, i: number, kind: 'grab' | 'retry' | 'flight') => (
    <div key={`${j.source}-${j.item}-${i}`} className="admin-row items-start">
      <span className={clsx('admin-icon-tile', kind === 'grab' ? 'bg-emerald-500/15 text-emerald-400' : kind === 'retry' ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-300')}>
        {kind === 'grab' ? <CheckCircle2 className="w-4 h-4" /> : kind === 'retry' ? <RefreshCw className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-ndp-text truncate">{j.item}</p>
        <p className="text-xs text-ndp-text-dim mt-0.5 break-words">
          {kind === 'grab'
            ? [j.release, j.quality].filter(Boolean).join(' · ')
            : kind === 'retry'
              ? [j.detail, j.attempts ? t('admin.zurg.attempts', '{{n}} attempts', { n: j.attempts }) : null, j.nextRetry ? t('zurg.next_try', 'next try {{when}}', { when: when(j.nextRetry, i18n.language) }) : null].filter(Boolean).join(' · ')
              : j.state}
        </p>
      </div>
      <span className="text-[11px] text-ndp-text-dim whitespace-nowrap mt-0.5">{when(j.updatedAt, i18n.language)}</span>
    </div>
  );

  return (
    <AdminTabLayout
      actions={
        <>
          <button type="button" onClick={() => void syncNow()} disabled={!!busy} className="btn-secondary flex items-center gap-2 !px-3.5 !py-2 !text-sm">
            {busy === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {t('admin.zurg.check_now', 'Check now')}
          </button>
          <button type="button" onClick={() => setConfirmRestart(true)} disabled={!!busy} className="btn-secondary flex items-center gap-2 !px-3.5 !py-2 !text-sm">
            {busy === 'restart' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
            {t('admin.zurg.restart_mount', 'Restart mount')}
          </button>
        </>
      }
    >
      <div className="space-y-7">
        {/* Health */}
        <section>
          <h3 className="admin-group-label">{t('admin.zurg.health', 'Health')}</h3>
          <div className="admin-group divide-y divide-white/[0.06]">
            <div className="admin-row">
              <span className={clsx('admin-icon-tile', data.reachable ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                {data.reachable ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              </span>
              <span className="flex-1 text-[15px] text-ndp-text">{data.serviceName}</span>
              <span className="text-sm text-ndp-text-muted">{data.reachable ? t('admin.zurg.reachable', 'Connected') : t('admin.zurg.unreachable', 'Unreachable')}</span>
            </div>
            <div className="admin-row">
              <span className={clsx('admin-icon-tile', mountOk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400')}><HardDrive className="w-4 h-4" /></span>
              <span className="flex-1 text-[15px] text-ndp-text">{t('admin.zurg.mount', 'Library mount')}</span>
              <span className="text-sm text-ndp-text-muted capitalize">{data.mount?.state ?? '-'}</span>
            </div>
            {data.providers && data.providers.length > 0 && (
              <div className="admin-row">
                <span className="admin-icon-tile"><Server className="w-4 h-4" /></span>
                <span className="flex-1 text-[15px] text-ndp-text">{t('admin.zurg.providers', 'Providers')}</span>
                <span className="text-sm text-ndp-text-muted capitalize">{data.providers.map((p) => p.name || p.type).join(', ')}</span>
              </div>
            )}
            <UpdateStatusRow kind="zurg" />
            <ZurgUpdateRow />
          </div>
          {data.error && <p className="admin-hint text-amber-300/90">{data.error}</p>}
        </section>

        {/* Debrid account */}
        {(data.accounts?.length ?? 0) > 0 && (
          <section>
            <h3 className="admin-group-label">{t('admin.zurg.account', 'Account')}</h3>
            <div className="admin-group divide-y divide-white/[0.06]">
              {data.accounts!.map((a, i) => {
                const daysLeft = a.premiumSecondsLeft !== null ? Math.floor(a.premiumSecondsLeft / 86400)
                  : a.expiresAt ? Math.floor((new Date(a.expiresAt).getTime() - Date.now()) / 86400000) : null;
                const tone = daysLeft === null ? 'bg-white/[0.06] text-ndp-text' : daysLeft <= 7 ? 'bg-red-500/15 text-red-400' : daysLeft <= 21 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-400';
                return (
                  <div key={`${a.provider}-${i}`} className="admin-row">
                    <span className={clsx('admin-icon-tile', tone)}><CreditCard className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-ndp-text capitalize">{a.provider} {a.plan ? <span className="admin-chip ml-1 uppercase">{a.plan}</span> : null}</p>
                      <p className="text-xs text-ndp-text-dim mt-0.5">
                        {a.expiresAt ? t('admin.zurg.expires', 'Renews/expires {{date}}', { date: new Date(a.expiresAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) }) : '-'}
                      </p>
                    </div>
                    {daysLeft !== null && (
                      <span className={clsx('admin-chip', tone)}>{t('admin.zurg.days_left', '{{n}} days left', { n: Math.max(0, daysLeft) })}</span>
                    )}
                  </div>
                );
              })}
              {data.library && (
                <div className="admin-row">
                  <span className="admin-icon-tile"><Library className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-ndp-text">{t('admin.zurg.library', '{{n}} releases', { n: (data.library.size ?? 0).toLocaleString(i18n.language) })}</p>
                    <p className="text-xs text-ndp-text-dim mt-0.5">
                      {[
                        data.library.directories?.movies !== undefined ? t('admin.zurg.lib_movies', '{{n}} in movies', { n: data.library.directories.movies.toLocaleString(i18n.language) }) : null,
                        data.library.directories?.shows !== undefined ? t('admin.zurg.lib_shows', '{{n}} in shows', { n: data.library.directories.shows.toLocaleString(i18n.language) }) : null,
                        data.library.streamedBytes ? t('admin.zurg.streamed', '{{size}} streamed since start', { size: data.library.streamedBytes >= 1e9 ? `${(data.library.streamedBytes / 1e9).toFixed(1)} GB` : `${Math.round(data.library.streamedBytes / 1e6)} MB` }) : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              )}
              {data.library && (
                <div className="admin-row">
                  <span className="admin-icon-tile"><Server className="w-4 h-4" /></span>
                  <span className="flex-1 text-sm text-ndp-text-muted break-all">{[data.library.version, data.library.uptime ? t('admin.zurg.uptime', 'up {{u}}', { u: data.library.uptime }) : null].filter(Boolean).join(' · ')}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Downloads still running on the account (only with the optional qBittorrent key) */}
        {data.downloads && (
          <section>
            <h3 className="admin-group-label">{t('admin.zurg.downloads', 'Downloading on the account')}</h3>
            <div className="admin-group divide-y divide-white/[0.06]">
              {data.downloads.length === 0
                ? <p className="admin-row text-sm text-ndp-text-dim">{t('admin.zurg.no_downloads', 'Nothing downloading, everything grabbed was already cached.')}</p>
                : data.downloads.map((d, i) => (
                  <div key={`${d.name}-${i}`} className="admin-row items-start">
                    <span className="admin-icon-tile bg-sky-500/15 text-sky-300"><Download className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ndp-text break-all leading-snug">{d.name}</p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.08] overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${Math.round(d.progress * 100)}%` }} /></div>
                      <p className="text-xs text-ndp-text-dim mt-1">{Math.round(d.progress * 100)}% · {d.state}{d.etaSec ? ` · ${Math.ceil(d.etaSec / 60)} min left` : ''}</p>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Acquisition */}
        {acq && (
          <>
            <section>
              <h3 className="admin-group-label">{t('admin.zurg.acquisition', 'Acquisition')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {stat(t('admin.zurg.done', 'Done'), counts['done'] ?? 0, 'text-emerald-400')}
                {stat(t('admin.zurg.retrying', 'Retrying'), counts['retrying'] ?? 0, (counts['retrying'] ?? 0) > 0 ? 'text-amber-300' : 'text-ndp-text')}
                {stat(t('admin.zurg.set_aside', 'Set aside'), counts['set aside'] ?? 0)}
                {stat(t('admin.zurg.streams', 'Streams'), data.activeStreams ?? 0)}
              </div>
              <p className="admin-hint">
                {t('admin.zurg.sources', 'Following {{list}}', { list: acq.sources.map((s) => s.name).join(', ') || '-' })}
                {data.fetchedAt ? ` · ${t('admin.zurg.updated', 'updated {{when}}', { when: when(data.fetchedAt, i18n.language) })}` : ''}
              </p>
            </section>

            {acq.inFlight.length > 0 && (
              <section>
                <h3 className="admin-group-label">{t('admin.zurg.working_on', 'Working on')}</h3>
                <div className="admin-group divide-y divide-white/[0.06]">{acq.inFlight.map((j, i) => jobRow(j, i, 'flight'))}</div>
              </section>
            )}

            {acq.retrying.length > 0 && (
              <section>
                <h3 className="admin-group-label">{t('admin.zurg.retrying_list', 'Retrying')}</h3>
                <div className="admin-group divide-y divide-white/[0.06]">{acq.retrying.map((j, i) => jobRow(j, i, 'retry'))}</div>
              </section>
            )}

            <section>
              <h3 className="admin-group-label">{t('admin.zurg.recent', 'Latest grabs')}</h3>
              <div className="admin-group divide-y divide-white/[0.06]">
                {acq.recentGrabs.length === 0
                  ? <p className="admin-row text-sm text-ndp-text-dim">{t('admin.zurg.none', 'Nothing yet')}</p>
                  : acq.recentGrabs.map((j, i) => jobRow(j, i, 'grab'))}
              </div>
              <p className="admin-hint">{t('admin.zurg.hint', 'LeMedia checks Zurg every 30 seconds (or at once when Zurg pings it) and marks a title available as soon as its placement exists.')}</p>
            </section>
          </>
        )}

      </div>

      <ConfirmModal
        open={confirmRestart}
        onClose={() => setConfirmRestart(false)}
        onConfirm={restartMount}
        title={t('admin.zurg.restart_confirm_title', 'Restart the library mount?')}
        description={t('admin.zurg.restart_confirm_desc', 'Anything playing from the library will stop for a few seconds while the mount comes back.')}
        confirmLabel={t('admin.zurg.restart_mount', 'Restart mount')}
        tone="danger"
      />
    </AdminTabLayout>
  );
}
