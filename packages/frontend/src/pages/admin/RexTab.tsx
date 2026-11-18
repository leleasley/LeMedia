import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { CheckCircle2, Clock, Cpu, Database, Film, Globe, HardDrive, History, Loader2, MemoryStick, MonitorPlay, Plug, Server, Tv, Users, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { AdminTabLayout } from './AdminTabLayout';
import { UpdateStatusRow } from './UpdateStatusRow';
import { RexCoverage } from './RexCoverage';
import { RexUpdateSettings } from './rex/RexUpdateSettings';
import { Spinner } from '@/components/Spinner';

interface RexData {
  configured: boolean;
  reachable?: boolean;
  name?: string;
  friendlyName?: string | null;
  latencyMs?: number;
  version?: string | null;
  machineId?: string | null;
  claimed?: boolean | null;
  libraries?: { title: string; type: string; count: number | null }[];
  nowPlaying?: { title: string; user: string | null; player: string | null; state: string | null; progress: number | null; transcoding: boolean; resolution: string | null; location: string | null }[];
  sources?: { name: string | null; url: string | null; features: string[] }[];
  accounts?: string[];
  recentlyAdded?: { title: string; type: string | null; addedAt: string | null }[];
  history?: { total: number; items: { title: string; user: string | null; viewedAt: string | null }[] };
  host?: { at: string; report: RexHost } | null;
  sync?: RexSync | null;
}

interface RexSync {
  items: number; held: number; deleted: number; total: number; percent: number; complete: boolean;
  ratePerMin: number | null; etaSecs: number | null; stalled: boolean; samples: number; at: string | null;
}

const duration = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.max(1, Math.round(s / 60))} min`);

interface RexHost {
  hostname: string | null; os: string | null; uptimeSec: number | null; load: number[]; cpus: number | null;
  memTotal: number | null; memAvailable: number | null; diskTotal: number | null; diskUsed: number | null;
  service: { active: boolean; since: string | null; rssBytes: number | null; restarts: number | null };
  binaryUpdated: string | null; files: { name: string; bytes: number }[]; claimed: boolean;
  rexDirect: string | null; lastFeed: string | null; warnings1h: number | null;
}

const bytes = (b: number | null) => (b === null ? '-' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const pct = (part: number | null, whole: number | null) => (part !== null && whole ? Math.round((part / whole) * 100) : null);

function Meter({ value }: Readonly<{ value: number | null }>) {
  if (value === null) return null;
  return (
    <div className="mt-1.5 h-1 rounded-full bg-white/[0.08] overflow-hidden">
      <div className={clsx('h-full', value >= 90 ? 'bg-red-400' : value >= 75 ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${value}%` }} />
    </div>
  );
}

/** Admin → Media → rex: the Plex server zurg feeds — status, libraries, who is watching,
 *  what arrived, watch history, sources and the accounts that can use it. */
export function RexTab() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<RexData | null>(null);
  const [view, setView] = useState<'overview' | 'series' | 'settings'>('overview');

  const load = useCallback(async () => {
    try { const { data } = await api.get<RexData>('/admin/rex/health'); setData(data); }
    catch { setData({ configured: true, reachable: false }); }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  const when = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return t('admin.rex.just_now', 'just now');
    if (mins < 60) return t('admin.rex.mins_ago', '{{n}} min ago', { n: mins });
    if (mins < 48 * 60) return t('admin.rex.hours_ago', '{{n}} h ago', { n: Math.round(mins / 60) });
    return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  };

  if (!data) return <AdminTabLayout><div className="flex justify-center py-16"><Spinner /></div></AdminTabLayout>;

  if (!data.configured) {
    return (
      <AdminTabLayout>
        <div className="admin-group">
          <div className="admin-row items-start">
            <span className="admin-icon-tile"><Server className="w-4 h-4" /></span>
            <div className="flex-1">
              <p className="text-[15px] font-medium text-ndp-text">{t('admin.rex.not_configured', 'No rex / Plex server connected')}</p>
              <p className="text-sm text-ndp-text-dim mt-1">{t('admin.rex.not_configured_hint', 'Add REX under Services.')}</p>
              <Link to="/admin?tab=services" className="btn-primary inline-flex mt-3 !px-4 !py-2 !text-sm">{t('admin.zurg.add_service', 'Open Services')}</Link>
            </div>
          </div>
        </div>
      </AdminTabLayout>
    );
  }

  const stat = (label: string, value: string | number, tone = 'text-ndp-text') => (
    <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{label}</p>
      <p className={clsx('font-display text-3xl leading-none mt-1.5', tone)}>{value}</p>
    </div>
  );
  const movies = data.libraries?.filter((l) => l.type === 'movie').reduce((n, l) => n + (l.count ?? 0), 0) ?? 0;
  const shows = data.libraries?.filter((l) => l.type === 'show').reduce((n, l) => n + (l.count ?? 0), 0) ?? 0;

  return (
    <AdminTabLayout>
      <div className="space-y-7">
        <nav aria-label="REX sections" className="flex flex-wrap gap-2">
          {([
            ['overview', 'Overview'],
            ['series', 'Series Manager'],
            ['settings', 'Settings'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}
              className={clsx('rounded-lg px-4 py-2 text-sm font-medium', view === id ? 'bg-ndp-accent text-white' : 'bg-white/5 text-ndp-text-muted hover:bg-white/10')}>
              {label}
            </button>
          ))}
        </nav>
        {view === 'series' && <RexCoverage />}
        {view === 'settings' && (
          <section>
            <h3 className="admin-group-label">REX settings</h3>
            <div className="admin-group divide-y divide-white/[0.06]">
              <UpdateStatusRow kind="rex" />
              <RexUpdateSettings />
              <div className="admin-row">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ndp-text">REX connection</p>
                  <p className="text-xs text-ndp-text-dim">Manage the REX address and access token in Services.</p>
                </div>
                <Link to="/admin?tab=services" className="btn-secondary !py-1.5 !px-3 text-sm">Open Services</Link>
              </div>
            </div>
          </section>
        )}
        {view === 'overview' && <>
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stat(t('admin.rex.status', 'Status'), data.reachable ? t('admin.rex.online', 'Online') : t('admin.rex.offline', 'Offline'), data.reachable ? 'text-emerald-400' : 'text-red-400')}
            {stat(t('admin.rex.watching', 'Watching'), data.nowPlaying?.length ?? 0, (data.nowPlaying?.length ?? 0) > 0 ? 'text-ndp-accent' : 'text-ndp-text')}
            {stat(t('admin.rex.movies', 'Movies'), movies.toLocaleString(i18n.language))}
            {stat(t('admin.rex.shows', 'Shows'), shows.toLocaleString(i18n.language))}
          </div>
        </section>

        {data.sync && (
          <section>
            <h3 className="admin-group-label">{t('admin.rex.sync', 'Library sync')}</h3>
            <div className="admin-group">
              <div className="admin-row items-start">
                <span className={clsx('admin-icon-tile', data.sync.complete ? 'bg-emerald-500/15 text-emerald-400' : data.sync.stalled ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300')}>
                  {data.sync.complete ? <CheckCircle2 className="w-4 h-4" /> : data.sync.stalled ? <Clock className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[15px] font-medium text-ndp-text">
                      {data.sync.complete
                        ? t('admin.rex.sync_done', 'Everything is identified')
                        : data.sync.stalled
                          ? t('admin.rex.sync_stalled', '{{n}} waiting, not moving for 15 minutes', { n: data.sync.held.toLocaleString(i18n.language) })
                          : t('admin.rex.sync_waiting', '{{n}} waiting for Zurg to probe them', { n: data.sync.held.toLocaleString(i18n.language) })}
                    </p>
                    <span className="font-display text-2xl leading-none text-ndp-text tabular-nums">{data.sync.percent}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className={clsx('h-full', data.sync.stalled ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${data.sync.percent}%` }} />
                  </div>
                  <p className="text-xs text-ndp-text-dim mt-1.5">
                    {[
                      t('admin.rex.sync_items', '{{n}} playable', { n: data.sync.items.toLocaleString(i18n.language) }),
                      data.sync.deleted ? t('admin.rex.sync_deleted', '{{n}} removed', { n: data.sync.deleted.toLocaleString(i18n.language) }) : null,
                      data.sync.ratePerMin ?  t('admin.rex.sync_rate', '{{n}} a minute', { n: data.sync.ratePerMin }) : null,
                      data.sync.etaSecs ? t('admin.rex.sync_eta', 'about {{d}} to go', { d: duration(data.sync.etaSecs) }) : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </div>
            <p className="admin-hint">{t('admin.rex.sync_hint', 'New files are held until Zurg has probed their media details (about 20 a minute), then they become playable in rex.')}</p>
          </section>
        )}

        <section>
          <h3 className="admin-group-label">{t('admin.rex.server', 'Server')}</h3>
          <div className="admin-group divide-y divide-white/[0.06]">
            <div className="admin-row">
              <span className={clsx('admin-icon-tile', data.reachable ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                {data.reachable ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-ndp-text truncate">{data.friendlyName || data.name || 'rex'}</p>
                <p className="text-xs text-ndp-text-dim mt-0.5 break-all">
                  {data.reachable
                    ? [data.version ? `v${data.version}` : null, data.latencyMs !== undefined ? `${data.latencyMs} ms` : null, data.claimed ? t('admin.rex.claimed', 'claimed') : data.claimed === false ? t('admin.rex.unclaimed', 'not claimed') : null].filter(Boolean).join(' · ')
                    : t('admin.rex.unreachable', 'Not answering')}
                </p>
              </div>
            </div>
            <UpdateStatusRow kind="rex" />
            {(data.libraries ?? []).map((l) => (
              <div key={l.title} className="admin-row">
                <span className="admin-icon-tile">{l.type === 'show' ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}</span>
                <span className="flex-1 min-w-0 truncate text-[15px] text-ndp-text">{l.title}</span>
                <span className="text-sm text-ndp-text-muted tabular-nums">{l.count !== null ? l.count.toLocaleString(i18n.language) : '-'}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="admin-group-label">{t('admin.rex.host', 'Host')}</h3>
          {(() => {
            const h = data.host?.report;
            if (!h) {
              return (
                <div className="admin-group">
                  <p className="admin-row text-sm text-ndp-text-dim">{t('admin.rex.host_waiting', 'Waiting for the first report from the rex machine (every 2 minutes).')}</p>
                </div>
              );
            }
            const memUsed = h.memTotal !== null && h.memAvailable !== null ? h.memTotal - h.memAvailable : null;
            const memPct = pct(memUsed, h.memTotal);
            const diskPct = pct(h.diskUsed, h.diskTotal);
            const rssPct = pct(h.service.rssBytes, h.memTotal);
            const stale = Date.now() - new Date(data.host!.at).getTime() > 10 * 60_000;
            const days = h.uptimeSec !== null ? Math.floor(h.uptimeSec / 86400) : null;
            return (
              <>
                <div className="admin-group divide-y divide-white/[0.06]">
                  <div className="admin-row">
                    <span className={clsx('admin-icon-tile', h.service.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}><Server className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-ndp-text">
                        {h.service.active ? t('admin.rex.service_running', 'rex service running') : t('admin.rex.service_down', 'rex service is not running')}
                      </p>
                      <p className="text-xs text-ndp-text-dim mt-0.5">
                        {[h.service.since ? t('admin.rex.since', 'since {{when}}', { when: when(h.service.since) }) : null,
                          h.service.restarts ? t('admin.rex.restarts', '{{n}} restarts', { n: h.service.restarts }) : null,
                          h.binaryUpdated ? t('admin.rex.binary', 'build from {{date}}', { date: new Date(h.binaryUpdated).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) }) : null,
                          h.lastFeed ? t('admin.rex.last_feed', 'last zurg update {{when}}', { when: when(h.lastFeed) }) : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="admin-row">
                    <span className="admin-icon-tile"><Cpu className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-ndp-text truncate">{h.hostname ?? 'rex'}{h.os ? <span className="text-ndp-text-dim"> · {h.os}</span> : null}</p>
                      <p className="text-xs text-ndp-text-dim mt-0.5">
                        {[h.cpus ? t('admin.rex.cpus', '{{n}} CPUs', { n: h.cpus }) : null,
                          h.load.length ? t('admin.rex.load', 'load {{l}}', { l: h.load.map((x) => x.toFixed(2)).join(' ') }) : null,
                          days !== null ? t('admin.rex.up_days', 'up {{n}} days', { n: days }) : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="admin-row">
                    <span className="admin-icon-tile"><MemoryStick className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-3 text-[15px] text-ndp-text">
                        <span>{t('admin.rex.memory', 'Memory')}</span>
                        <span className="text-sm text-ndp-text-muted tabular-nums">{bytes(memUsed)} / {bytes(h.memTotal)}</span>
                      </div>
                      <Meter value={memPct} />
                      {h.service.rssBytes !== null && <p className="text-xs text-ndp-text-dim mt-1">{t('admin.rex.rex_uses', 'rex itself uses {{size}} ({{p}}%)', { size: bytes(h.service.rssBytes), p: rssPct ?? 0 })}</p>}
                    </div>
                  </div>
                  <div className="admin-row">
                    <span className="admin-icon-tile"><HardDrive className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-3 text-[15px] text-ndp-text">
                        <span>{t('admin.rex.disk', 'Disk')}</span>
                        <span className="text-sm text-ndp-text-muted tabular-nums">{bytes(h.diskUsed)} / {bytes(h.diskTotal)}</span>
                      </div>
                      <Meter value={diskPct} />
                    </div>
                  </div>
                  {h.files.map((f) => (
                    <div key={f.name} className="admin-row">
                      <span className="admin-icon-tile"><Database className="w-4 h-4" /></span>
                      <span className="flex-1 min-w-0 truncate text-ndp-text font-mono text-sm">{f.name}</span>
                      <span className="text-sm text-ndp-text-muted tabular-nums">{bytes(f.bytes)}</span>
                    </div>
                  ))}
                  <div className="admin-row">
                    <span className="admin-icon-tile"><Globe className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-ndp-text">{h.claimed ? t('admin.rex.claimed_plex', 'Linked to a Plex account') : t('admin.rex.not_claimed_plex', 'Not linked to a Plex account')}</p>
                      <p className="text-xs text-ndp-text-dim mt-0.5 break-all">{h.rexDirect ? t('admin.rex.direct_on', 'rex-direct: {{host}}', { host: h.rexDirect }) : t('admin.rex.direct_off', 'rex-direct off')}</p>
                    </div>
                  </div>
                </div>
                <p className={clsx('admin-hint', stale && '!text-amber-300/90')}>
                  {stale
                    ? t('admin.rex.host_stale', 'Last report {{when}}, the reporter on the rex machine may have stopped.', { when: when(data.host!.at) })
                    : t('admin.rex.host_hint', 'Reported by the rex machine {{when}}.', { when: when(data.host!.at) })}
                  {h.warnings1h ? ` ${t('admin.rex.warnings', '{{n}} warnings in rex\'s log in the last hour.', { n: h.warnings1h })}` : ''}
                </p>
              </>
            );
          })()}
        </section>

        <section>
          <h3 className="admin-group-label">{t('admin.rex.now_playing', 'Now playing')}</h3>
          <div className="admin-group divide-y divide-white/[0.06]">
            {(data.nowPlaying?.length ?? 0) === 0
              ? <p className="admin-row text-sm text-ndp-text-dim">{t('admin.rex.idle', 'Nobody is watching right now')}</p>
              : data.nowPlaying!.map((s, i) => (
                <div key={`${s.title}-${i}`} className="admin-row items-start">
                  <span className="admin-icon-tile bg-ndp-accent/15 text-ndp-accent"><MonitorPlay className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-ndp-text truncate">{s.title}</p>
                    <p className="text-xs text-ndp-text-dim mt-0.5">
                      {[s.user, s.player, s.resolution ? s.resolution.toUpperCase().replace(/^(\d+)$/, '$1p') : null, s.transcoding ? t('admin.rex.transcoding', 'transcoding') : t('admin.rex.direct', 'direct play'), s.location === 'wan' ? t('admin.rex.remote', 'remote') : null, s.state === 'paused' ? t('admin.rex.paused', 'paused') : null].filter(Boolean).join(' · ')}
                    </p>
                    {s.progress !== null && <div className="mt-1.5 h-1 rounded-full bg-white/[0.08] overflow-hidden"><div className="h-full bg-ndp-accent" style={{ width: `${Math.round(s.progress * 100)}%` }} /></div>}
                  </div>
                </div>
              ))}
          </div>
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section>
            <h3 className="admin-group-label">{t('admin.rex.recent', 'Recently added')}</h3>
            <div className="admin-group divide-y divide-white/[0.06]">
              {(data.recentlyAdded?.length ?? 0) === 0
                ? <p className="admin-row text-sm text-ndp-text-dim">{t('admin.zurg.none', 'Nothing yet')}</p>
                : data.recentlyAdded!.map((r, i) => (
                  <div key={`${r.title}-${i}`} className="admin-row">
                    <span className="admin-icon-tile">{r.type === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}</span>
                    <span className="flex-1 min-w-0 text-[15px] text-ndp-text truncate">{r.title}</span>
                    <span className="text-xs text-ndp-text-dim whitespace-nowrap">{when(r.addedAt)}</span>
                  </div>
                ))}
            </div>
          </section>

          <section>
            <h3 className="admin-group-label">{t('admin.rex.history', 'Watch history')}</h3>
            <div className="admin-group divide-y divide-white/[0.06]">
              {(data.history?.items.length ?? 0) === 0
                ? (
                  <div className="admin-row">
                    <span className="admin-icon-tile"><History className="w-4 h-4" /></span>
                    <span className="flex-1 text-sm text-ndp-text-dim">{t('admin.rex.no_history', 'Nothing watched yet')}</span>
                  </div>
                )
                : data.history!.items.map((h, i) => (
                  <div key={`${h.title}-${i}`} className="admin-row">
                    <span className="admin-icon-tile"><Clock className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-ndp-text truncate">{h.title}</p>
                      {h.user && <p className="text-xs text-ndp-text-dim">{h.user}</p>}
                    </div>
                    <span className="text-xs text-ndp-text-dim whitespace-nowrap">{when(h.viewedAt)}</span>
                  </div>
                ))}
            </div>
          </section>
        </div>

        <section>
          <h3 className="admin-group-label">{t('admin.rex.sources', 'Sources')}</h3>
          <div className="admin-group divide-y divide-white/[0.06]">
            {(data.sources?.length ?? 0) === 0
              ? <p className="admin-row text-sm text-ndp-text-dim">{t('admin.rex.no_sources', 'No sources reported')}</p>
              : data.sources!.map((s, i) => (
                <div key={`${s.name}-${i}`} className="admin-row items-start flex-wrap sm:flex-nowrap">
                  <span className="admin-icon-tile"><Plug className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-ndp-text capitalize">{s.name ?? '-'}</p>
                    <p className="text-xs text-ndp-text-dim break-all">{s.url}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 basis-full pl-11 sm:basis-auto sm:pl-0 sm:justify-end sm:max-w-[45%]">{s.features.map((f) => <span key={f} className="admin-chip">{f.replace(/_/g, ' ')}</span>)}</div>
                </div>
              ))}
          </div>
          <p className="admin-hint">{t('admin.rex.sources_hint', 'rex builds its library from these. Zurg pushes every change, so nothing here needs scanning.')}</p>
        </section>

        {(data.accounts?.length ?? 0) > 0 && (
          <section>
            <h3 className="admin-group-label">{t('admin.rex.accounts', 'Accounts')}</h3>
            <div className="admin-group divide-y divide-white/[0.06]">
              {data.accounts!.map((a) => (
                <div key={a} className="admin-row">
                  <span className="admin-icon-tile"><Users className="w-4 h-4" /></span>
                  <span className="flex-1 min-w-0 truncate text-[15px] text-ndp-text">{a}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        </>}
      </div>
    </AdminTabLayout>
  );
}
