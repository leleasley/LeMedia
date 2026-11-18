import { useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, ArrowUpCircle, CheckCircle2, ChevronDown, ExternalLink, HardDrive, Loader2, RotateCw, Undo2, XCircle, Clock } from 'lucide-react';
import api from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import Switch from '@/components/ui/Switch';
import { showToast, toastApiError } from '@/utils/toast';
import { APP_META, ago, bytes, uptime, useArrJob, type AppOverview, type ArrJob } from './shared';
import { Spinner } from '@/components/Spinner';

/** One card per app: status, version and update, restart, library numbers, health and disks. */
export function ArrOverview({ apps, helper, jobs, onChanged, onSettings }: Readonly<{
  apps: AppOverview[]; helper: boolean; jobs: ArrJob[]; onChanged: () => void; onSettings: () => void;
}>) {
  return (
    <div className={clsx('grid gap-4', apps.length > 1 && 'xl:grid-cols-2')}>
      {apps.map((a) => <AppCard key={a.app} a={a} helper={helper} running={jobs.find((j) => j.app === a.app) ?? null} onChanged={onChanged} onSettings={onSettings} />)}
    </div>
  );
}

function AppCard({ a, helper, running, onChanged, onSettings }: Readonly<{ a: AppOverview; helper: boolean; running: ArrJob | null; onChanged: () => void; onSettings: () => void }>) {
  const meta = APP_META[a.app];
  const Icon = meta.icon;
  const [jobId, setJobId] = useState<string | null>(running?.id ?? null);
  const [ask, setAsk] = useState<'restart' | 'update' | 'rollback' | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const job = useArrJob(jobId, (j) => {
    setJobId(null);
    if (j.status === 'failed') showToast(j.error ?? `${meta.name} ${j.kind} failed`, 'error');
    else showToast(j.phase, 'success');
    onChanged();
  });

  const saveAuto = async (enabled: boolean, localHour: number) => {
    try { await api.put(`/admin/arr/${a.app}/auto`, { enabled, utcHour: toUtcHour(localHour) }); onChanged(); }
    catch (err) { toastApiError(err, 'Could not save'); }
  };

  const start = async (kind: 'restart' | 'update' | 'rollback') => {
    try { const { data } = await api.post<{ jobId: string }>(`/admin/arr/${a.app}/${kind}`); setJobId(data.jobId); }
    catch (err) { toastApiError(err, `Could not ${kind} ${meta.name}`); }
  };

  if (!a.configured) {
    return (
      <div className="card p-5 flex items-center gap-3">
        <span className={clsx('w-11 h-11 rounded-xl flex items-center justify-center', meta.tone)}><Icon className="w-5 h-5" /></span>
        <div className="flex-1"><p className="font-medium text-ndp-text">{meta.name}</p><p className="text-sm text-ndp-text-dim">Not set up. Add it under Services.</p></div>
      </div>
    );
  }

  const u = a.update;
  const errors = (a.health ?? []).filter((h) => h.type === 'error');
  const warnings = (a.health ?? []).filter((h) => h.type !== 'error' && h.source !== 'UpdateCheck');
  const busy = !!jobId;
  const stats: [string, string | number][] = a.app === 'prowlarr'
    ? [['Indexers', a.counts?.indexers ?? '-'], ['Enabled', a.counts?.enabledIndexers ?? '-']]
    : [[a.app === 'sonarr' ? 'Series' : 'Movies', a.counts?.items?.toLocaleString() ?? '-'], ['Missing', a.counts?.missing ?? '-'], ['In queue', a.counts?.queue ?? '-']];

  return (
    <div className={clsx('rounded-2xl bg-ndp-surface ring-1 ring-inset overflow-hidden flex flex-col', a.online ? 'ring-white/[0.06]' : 'ring-red-500/30')}>
      {/* Header */}
      <div className="p-5 pb-4 flex items-start gap-3">
        <span className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-inset', meta.tone, meta.ring)}><Icon className="w-6 h-6" /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-2xl leading-none text-ndp-text">{meta.name}</h3>
            <span className={clsx('admin-chip', a.online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300')}>
              <span className={clsx('w-1.5 h-1.5 rounded-full', a.online ? 'bg-emerald-400' : 'bg-red-400')} />{a.online ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-sm text-ndp-text-dim mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {a.version && <span className="font-mono text-ndp-text-muted">{a.version}</span>}
            {a.branch && <span className={clsx('admin-chip', a.branch === 'develop' || a.branch === 'nightly' ? 'bg-violet-500/15 text-violet-300' : '')}>{a.branch}</span>}
            {(a.container?.startedAt || a.startTime) && <span>up {uptime(a.container?.startedAt ?? a.startTime)}</span>}
          </p>
          {!a.online && a.error && <p className="text-sm text-red-300 mt-1">{a.error}</p>}
        </div>
        {a.link && (
          <a href={a.link} target="_blank" rel="noreferrer" className="btn-secondary !py-2 !px-3 text-sm inline-flex items-center gap-1.5 flex-shrink-0">Open<ExternalLink className="w-3.5 h-3.5" /></a>
        )}
      </div>

      {/* Update */}
      {a.online && u && (
        <div className={clsx('mx-5 mb-4 rounded-xl px-4 py-3 ring-1 ring-inset', u.available ? 'bg-ndp-accent/[0.08] ring-ndp-accent/25' : 'bg-white/[0.02] ring-white/[0.06]')}>
          <div className="flex items-center gap-3">
            {u.available ? <ArrowUpCircle className="w-5 h-5 text-ndp-accent flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ndp-text">
                {u.available ? `${u.latest?.version} available` : 'Up to date'}
                {u.available && u.behind > 1 && <span className="text-ndp-text-dim font-normal"> ({u.behind} releases behind)</span>}
              </p>
              <p className="text-xs text-ndp-text-dim">
                {u.available
                  ? [u.latest?.releaseDate ? `released ${ago(u.latest.releaseDate)}` : null, `${a.branch} channel`,
                    u.imageReady === false ? 'image not published yet' : u.imageTag ? `image ${u.imageTag}` : null].filter(Boolean).join(' · ')
                  : `Latest on the ${a.branch} channel${u.latest ? `, released ${ago(u.latest.releaseDate)}` : ''}`}
              </p>
            </div>
            {u.available && !u.blocker && (
              <button type="button" className="btn-primary !py-2 !px-3.5 text-sm inline-flex items-center gap-1.5 flex-shrink-0"
                disabled={busy || u.imageReady === false} onClick={() => (helper ? setAsk('update') : onSettings())}
                title={helper ? undefined : 'Set up the host helper first'}>
                {busy && job?.kind === 'update' ? <Loader2 className="w-4 h-4 animate-spin" /> : u.imageReady === false ? <Clock className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                {u.imageReady === false ? 'Waiting for image' : 'Update'}
              </button>
            )}
          </div>
          {u.changes.length > 0 && (
            <>
              <button type="button" className="mt-2 text-xs text-ndp-accent hover:underline inline-flex items-center gap-1" onClick={() => setShowChanges(!showChanges)}>
                What's new<ChevronDown className={clsx('w-3 h-3 transition-transform', showChanges && 'rotate-180')} />
              </button>
              {showChanges && (
                <div className="mt-2 space-y-2 max-h-56 overflow-auto pr-1">
                  {u.changes.map((c) => (
                    <div key={c.version}>
                      <p className="text-xs font-semibold text-ndp-text-muted font-mono">{c.version}</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {c.new.map((n, i) => <li key={`n${i}`} className="text-xs text-ndp-text flex gap-1.5"><span className="text-emerald-400">+</span>{n}</li>)}
                        {c.fixed.map((n, i) => <li key={`f${i}`} className="text-xs text-ndp-text-dim flex gap-1.5"><span className="text-sky-400">•</span>{n}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {u.available && !u.blocker && u.imageReady === false && (
            <p className="text-xs text-ndp-text-dim mt-2">LinuxServer hasn't published the Docker image for {u.latest?.version} yet ({u.imageTag}); it usually appears within a few hours of a release. LeMedia checks every 15 minutes and Update switches on by itself{a.auto?.enabled ? ', or the automatic update picks it up' : ''}.</p>
          )}
          {u.available && u.blocker && <p className="text-xs text-ndp-text-dim mt-2">{u.blocker}. Update it the way you normally do.</p>}
          {u.available && !helper && <p className="text-xs text-ndp-text-dim mt-2">Updating needs the host helper, <button type="button" onClick={onSettings} className="text-ndp-accent hover:underline">set it up in Settings</button>.</p>}
        </div>
      )}

      {/* Automatic updates */}
      {a.online && helper && !u?.blocker && (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Switch checked={!!a.auto?.enabled} onChange={(on) => void saveAuto(on, toLocalHour(a.auto?.utcHour ?? 4))} label={`Update ${meta.name} automatically`} className="-ml-2" />
          <span className="text-ndp-text">Update automatically at</span>
          <select className="input !py-1 !px-2 w-24 text-sm" value={toLocalHour(a.auto?.utcHour ?? 4)} aria-label="Update hour"
            onChange={(e) => void saveAuto(!!a.auto?.enabled, Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
          {a.auto?.last && <span className="text-xs text-ndp-text-dim w-full">Last automatic run {ago(a.auto.last.at)}: {a.auto.last.result}</span>}
        </div>
      )}

      {/* Job progress */}
      {busy && (
        <div className="mx-5 mb-4 flex items-center gap-2.5 rounded-xl bg-sky-500/10 ring-1 ring-inset ring-sky-500/25 px-4 py-2.5 text-sm text-ndp-text">
          <Spinner size="sm" />{job?.phase ?? 'Starting…'}
        </div>
      )}

      {/* Numbers */}
      {a.online && (
        <div className={clsx('grid gap-px bg-white/[0.06] border-y border-white/[0.06]', stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {stats.map(([label, value]) => (
            <div key={label} className="bg-ndp-surface px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ndp-text-dim">{label}</p>
              <p className={clsx('font-display text-2xl leading-none mt-1 tabular-nums', label === 'Missing' && Number(value) > 0 ? 'text-amber-300' : 'text-ndp-text')}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Health + disks */}
      <div className="px-5 py-4 space-y-2 flex-1">
        {a.online && errors.length + warnings.length === 0 && <p className="text-sm text-ndp-text-dim flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" />No health issues</p>}
        {[...errors, ...warnings].map((h, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {h.type === 'error' ? <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />}
            <span className={clsx('min-w-0', h.type === 'error' ? 'text-red-200/90' : 'text-ndp-text-muted')}>
              {h.message}{h.wikiUrl && <> <a href={h.wikiUrl} target="_blank" rel="noreferrer" className="text-ndp-accent hover:underline">More</a></>}
            </span>
          </div>
        ))}
        {(a.disks ?? []).map((d) => {
          const used = 1 - d.free / d.total;
          return (
            <div key={d.path} className="flex items-center gap-2 text-xs text-ndp-text-dim pt-1">
              <HardDrive className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="font-mono truncate max-w-[8rem]" title={d.path}>{d.label || d.path}</span>
              <span className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden"><span className={clsx('block h-full', used > 0.9 ? 'bg-red-400' : used > 0.75 ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${Math.round(used * 100)}%` }} /></span>
              <span className="whitespace-nowrap">{bytes(d.free)} free</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2">
        <p className="flex-1 min-w-0 text-xs text-ndp-text-dim truncate font-mono" title={a.container?.image}>{a.container?.image ?? a.packageVersion ?? ''}</p>
        {a.previous && a.previous.version !== a.version && helper && (
          <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5" disabled={busy} onClick={() => setAsk('rollback')} title={a.previous.image}>
            <Undo2 className="w-3.5 h-3.5" />Roll back to {a.previous.version}
          </button>
        )}
        <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5" disabled={busy} onClick={() => setAsk('restart')}>
          {busy && job?.kind === 'restart' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}Restart
        </button>
      </div>

      <ConfirmModal open={ask === 'restart'} title={`Restart ${meta.name}?`} confirmLabel="Restart"
        description={`${meta.name} stops for about half a minute. Downloads and imports carry on once it's back.`}
        onClose={() => setAsk(null)} onConfirm={() => start('restart')} />
      <ConfirmModal open={ask === 'rollback'} title={`Roll ${meta.name} back to ${a.previous?.version}?`} confirmLabel="Roll back" tone="danger"
        description={`LeMedia puts back the exact image that ran before (${a.previous?.image ?? ''}) and recreates the container. ${meta.name} is offline for a minute or two. Older versions can't always read a database a newer one has upgraded, so only do this if the update broke something.`}
        onClose={() => setAsk(null)} onConfirm={() => start('rollback')} />
      <ConfirmModal open={ask === 'update'} title={`Update ${meta.name} to ${u?.latest?.version}?`} confirmLabel="Update"
        description={`LeMedia pulls ${u?.imageTag} and recreates the container (the compose file is backed up first, and restored if it fails). ${meta.name} is offline for a minute or two.`}
        onClose={() => setAsk(null)} onConfirm={() => start('update')} />
    </div>
  );
}

/** The hour picker shows the browser's local time; the server schedules in UTC. */
function toUtcHour(localHour: number) { const d = new Date(); d.setHours(localHour, 0, 0, 0); return d.getUTCHours(); }
function toLocalHour(utcHour: number) { const d = new Date(); d.setUTCHours(utcHour, 0, 0, 0); return d.getHours(); }
