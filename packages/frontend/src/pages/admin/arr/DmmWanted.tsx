import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  AlertTriangle, CheckCircle2, Clock, Database, ExternalLink, FileArchive, History,
  Loader2, RefreshCw, Search, Trash2, Upload, XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { showToast, toastApiError } from '@/utils/toast';
import { Spinner } from '@/components/Spinner';
import { SwitchTrack } from '@/components/ui/Switch';
import { ConfirmModal } from '@/components/ConfirmModal';

type App = 'radarr' | 'sonarr';

interface Backup {
  app: App;
  id: number;
  name: string;
  type: string;
  size: number;
  time: string;
  path: string;
}

interface BackupList {
  app: App;
  serviceName: string | null;
  backups: Backup[];
  error: string | null;
}

interface ImportRow {
  id: number;
  app: App;
  backupName: string;
  source: 'upload' | 'backup' | 'auto' | string;
  found: number;
  added: number;
  alreadyWanted: number;
  createdAt: string;
}

interface ZurgSummary {
  sources: { id: string; name: string }[];
  total: number;
  counts: Record<string, number>;
  recent: { item: string; state: string; updatedAt: string | null; detail: string | null }[];
}

interface Overview {
  configured: boolean;
  sponsor: 'active' | 'lapsed' | 'unknown';
  sponsorName: string | null;
  error: string | null;
  backups: BackupList[];
  imports: ImportRow[];
  zurg: ZurgSummary | null;
  autoImport: { enabled: boolean; cronExpression: string; lastRunAt: string | null; lastStatus: string | null; lastResult: string | null } | null;
  limits: { maxBytes: number; importsPerHour: number };
}

interface ImportResult {
  app: App;
  found: number;
  added: number;
  alreadyWanted: number;
  overCap: number;
  noImdbId: number;
  notAvailable: number;
  seasonsTmdbLacks: { title: string; seasons: number[] }[];
}

interface WantedTitle {
  app: App;
  id: number;
  title: string;
  year: number | null;
  imdbId: string | null;
  wanted: boolean;
  fetched: boolean;
  seasons: number[] | null;
  addedAt: string | null;
}

interface WantedSnapshot {
  items: WantedTitle[];
  total: number;
  wanted: number;
  fetched: number;
  truncated: boolean;
}

type Sort = 'newest' | 'oldest' | 'largest';
type Filter = 'all' | App;

const MB = 1024 * 1024;

const fmtSize = (bytes: number) => `${(bytes / MB).toFixed(bytes >= 100 * MB ? 0 : 1)} MB`;
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

/**
 * Admin → Media → DMM: the sponsor's wanted list and the backups that feed it.
 *
 * Reading DMM's wanted list marks it as polled by zurg, so this page never reads it — zurg's own
 * snapshot supplies the fetch state instead. That way checking on things cannot make zurg look
 * healthier than it is.
 */
export function DmmWanted() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [busy, setBusy] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState<App | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [wanted, setWanted] = useState<WantedSnapshot | null>(null);
  const [wantedError, setWantedError] = useState<string | null>(null);
  const [wantedLoading, setWantedLoading] = useState(false);
  const [wantedQuery, setWantedQuery] = useState('');
  const [removeTarget, setRemoveTarget] = useState<WantedTitle | null>(null);

  // Upload fallback state.
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const { data: next } = await api.get<Overview>('/admin/dmm/overview');
      setData(next);
      setError(null);
    } catch (err) {
      toastApiError(err, t('admin.dmm.status_failed', 'Could not load the DMM page'));
    } finally {
      if (spin) setRefreshing(false);
    }
  }, [t]);

  const loadWanted = useCallback(async (fresh = false) => {
    setWantedLoading(true);
    try {
      const { data: next } = await api.get<WantedSnapshot>(`/admin/dmm/wanted${fresh ? '?fresh=1' : ''}`);
      setWanted(next);
      setWantedError(null);
    } catch (err: any) {
      setWantedError(err?.response?.data?.error || t('admin.dmm.wanted_failed', 'Could not read the wanted list'));
    } finally {
      setWantedLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); void loadWanted(); }, [load, loadWanted]);

  const importBackup = async (backup: Backup) => {
    const key = `${backup.app}:${backup.name}`;
    setBusy(key);
    setError(null);
    try {
      const { data: res } = await api.post<ImportResult>('/admin/dmm/import-backup', { app: backup.app, name: backup.name }, { timeout: 10 * 60_000 });
      setResult(res);
      showToast(t('admin.dmm.import_done', 'Imported {{added}} titles to the DMM wanted list', { added: res.added }), 'success');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('admin.dmm.failed', 'The import failed'));
    } finally {
      setBusy(null);
    }
  };

  const backupNow = async (app: App) => {
    setBackingUp(app);
    try {
      await api.post('/admin/dmm/backup-now', { app });
      showToast(t('admin.dmm.backup_started', '{{app}} is making a backup — it should appear in a few seconds.', { app: app === 'radarr' ? 'Radarr' : 'Sonarr' }), 'success');
      window.setTimeout(() => { void load(); }, 5000);
    } catch (err: any) {
      setError(err?.response?.data?.error || t('admin.dmm.backup_failed', 'Could not start a backup'));
    } finally {
      setBackingUp(null);
    }
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const { data: res } = await api.post<ImportResult>(`/admin/dmm/wanted-import?name=${encodeURIComponent(file.name)}`, file, {
        headers: { 'Content-Type': 'application/zip' },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 10 * 60_000,
        onUploadProgress: (event) => {
          if (event.total) setProgress(Math.round((event.loaded / event.total) * 100));
        },
      });
      setResult(res);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('admin.dmm.failed', 'The import failed'));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const removeWanted = async (title: WantedTitle) => {
    try {
      await api.delete(`/admin/dmm/wanted/${title.app}/${title.id}`);
      showToast(t('admin.dmm.wanted_removed', 'Removed {{title}} from the wanted list', { title: title.title }), 'success');
      await Promise.all([loadWanted(true), load()]);
    } catch (err: any) {
      toastApiError(err, t('admin.dmm.wanted_remove_failed', 'Could not remove that title'));
    }
  };

  const toggleAuto = async (enabled: boolean) => {
    setBusy('auto');
    try {
      await api.put('/admin/jobs/dmm_auto_import', { enabled });
      await load();
    } catch (err) {
      toastApiError(err, t('admin.dmm.auto_failed', 'Could not change the scheduled import'));
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => {
    const all = (data?.backups ?? []).flatMap((list) => list.backups.map((b) => ({ ...b, serviceName: list.serviceName })));
    const filtered = filter === 'all' ? all : all.filter((b) => b.app === filter);
    return filtered.sort((a, b) => {
      if (sort === 'largest') return b.size - a.size;
      const cmp = a.time.localeCompare(b.time);
      return sort === 'oldest' ? cmp : -cmp;
    });
  }, [data?.backups, filter, sort]);

  const filteredWanted = useMemo(() => {
    const needle = wantedQuery.trim().toLowerCase();
    const items = wanted?.items ?? [];
    return needle ? items.filter((w) => w.title.toLowerCase().includes(needle)) : items;
  }, [wanted?.items, wantedQuery]);

  const stat = (label: string, value: number | string, tone = 'text-ndp-text') => (
    <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{label}</p>
      <p className={clsx('font-display text-3xl leading-none mt-1.5', tone)}>{value}</p>
    </div>
  );

  if (!data) {
    return <div className="admin-group admin-row justify-center py-12 text-sm text-ndp-text-dim"><Spinner size="sm" />{t('common.loading')}</div>;
  }

  if (!data.configured) {
    return (
      <section>
        <h3 className="admin-group-label">{t('admin.dmm.title', 'DMM wanted list')}</h3>
        <div className="admin-group">
          <div className="admin-row">
            <span className="admin-icon-tile"><AlertTriangle className="w-4 h-4" /></span>
            <p className="flex-1 min-w-0 text-sm text-ndp-text-muted">
              {t('admin.dmm.not_configured', 'Add Debrid Media Manager in Services with your sponsor API key (Gatekeeper issues it), then come back here.')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const totals = (data.backups ?? []).reduce((n, list) => n + list.backups.length, 0);
  const imported = (data.imports ?? []).reduce((n, row) => n + row.added, 0);

  return (
    <div className="space-y-7">
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stat(
            t('admin.dmm.stat_sponsor', 'Sponsorship'),
            data.sponsor === 'active' ? (data.sponsorName ?? t('admin.dmm.sponsor_active', 'Active sponsorship')) : t('admin.dmm.sponsor_lapsed', 'Sponsorship not active'),
            data.sponsor === 'active' ? 'text-emerald-400' : 'text-amber-400',
          )}
          {stat(t('admin.dmm.stat_backups', 'Backups'), totals)}
          {stat(t('admin.dmm.stat_imported', 'Imported'), imported)}
          {stat(t('admin.dmm.stat_fetched', 'Zurg fetched'), data.zurg?.counts.done ?? 0)}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h3 className="admin-group-label !mb-0">{t('admin.dmm.connection', 'Connection')}</h3>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="btn-secondary flex items-center gap-2 !px-3 !py-2 !text-sm disabled:opacity-50">
            {refreshing ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
            {t('admin.dmm.refresh', 'Refresh')}
          </button>
        </div>

        <div className="admin-group divide-y divide-white/[0.06]">
          <div className="admin-row">
            <span className={clsx('admin-icon-tile', data.sponsor === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-300')}>
              {data.sponsor === 'active' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-ndp-text">
                {data.sponsor === 'active'
                  ? t('admin.dmm.sponsor_named', 'Sponsor: {{name}}', { name: data.sponsorName ?? '—' })
                  : t('admin.dmm.sponsor_lapsed', 'Sponsorship not active')}
              </p>
              <p className="text-xs text-ndp-text-dim mt-0.5">
                {data.error || t('admin.dmm.connection_desc', 'The key in Services is exchanged for a short-lived sponsor token; DMM refuses a lapsed key.')}
              </p>
            </div>
            <span className="admin-chip flex-shrink-0">{t('admin.dmm.limit_chip', '{{n}} imports an hour', { n: data.limits.importsPerHour })}</span>
          </div>

          {[
            { href: 'https://debridmediamanager.com/wanted', label: t('admin.dmm.open_wanted', 'DMM wanted list'), desc: t('admin.dmm.open_wanted_desc', 'What zurg is working through.') },
            { href: 'https://debridmediamanager.com/settings', label: t('admin.dmm.open_settings', 'DMM settings'), desc: t('admin.dmm.open_settings_desc', 'Search, player and playback options on your DMM account.') },
            { href: 'https://gatekeeper.debridmediamanager.com/', label: t('admin.dmm.open_gatekeeper', 'Gatekeeper'), desc: t('admin.dmm.open_gatekeeper_desc', 'Where the sponsor API key comes from.') },
          ].map((link) => (
            <div key={link.href} className="admin-row">
              <span className="admin-icon-tile"><ExternalLink className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ndp-text">{link.label}</p>
                <p className="text-xs text-ndp-text-dim mt-0.5">{link.desc}</p>
              </div>
              <a href={link.href} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-2 !px-3 text-sm inline-flex items-center gap-1.5 flex-shrink-0">
                {t('admin.dmm.open', 'Open')}<ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
        <p className="admin-hint">{t('admin.dmm.intro', 'Import what Radarr or Sonarr are still looking for. Everything they have not got is added to your DMM wanted list for zurg to fetch: monitored films without a file, and the missing seasons of monitored shows.')}</p>
      </section>


      {/* Wanted list — read through DMM's arr API, which (unlike the sponsor endpoint) does not
          mark the list as polled by zurg. */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h3 className="admin-group-label !mb-0">{t('admin.dmm.wanted_title', 'Wanted list')}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ndp-text-dim" aria-hidden />
              <input
                value={wantedQuery}
                onChange={(e) => setWantedQuery(e.target.value)}
                placeholder={t('admin.dmm.wanted_search', 'Search the list')}
                aria-label={t('admin.dmm.wanted_search', 'Search the list')}
                className="input py-2 pl-8 text-sm w-48"
              />
            </div>
            <button type="button" onClick={() => void loadWanted(true)} disabled={wantedLoading} className="btn-secondary flex items-center gap-2 !px-3 !py-2 !text-sm disabled:opacity-50">
              {wantedLoading ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
              {t('admin.dmm.refresh', 'Refresh')}
            </button>
          </div>
        </div>

        {wanted && wanted.total > 0 && (
          <div className="flex flex-wrap gap-2 text-xs mb-3">
            <span className="admin-chip">{t('admin.dmm.wanted_to_fetch', '{{n}} to fetch', { n: wanted.wanted })}</span>
            <span className="admin-chip">{t('admin.dmm.wanted_fetched', '{{n}} fetched', { n: wanted.fetched })}</span>
            <span className="admin-chip">{t('admin.dmm.wanted_total', '{{n}} on the list', { n: wanted.total })}</span>
          </div>
        )}

        {wantedError ? (
          <div className="admin-group">
            <div className="admin-row text-sm text-ndp-danger">{wantedError}</div>
          </div>
        ) : !wanted ? (
          <div className="admin-group admin-row justify-center py-10 text-sm text-ndp-text-dim"><Spinner size="sm" />{t('common.loading')}</div>
        ) : wanted.items.length === 0 ? (
          <div className="admin-group">
            <div className="admin-row text-sm text-ndp-text-dim">{t('admin.dmm.wanted_empty', 'Nothing on the wanted list yet. Import a backup above, or press Want on a title in DMM.')}</div>
          </div>
        ) : filteredWanted.length === 0 ? (
          <p className="admin-hint">{t('admin.dmm.wanted_no_match', 'No title matches that search.')}</p>
        ) : (
          <div className="admin-group divide-y divide-white/[0.06]">
            {filteredWanted.map((w) => (
              <div key={`${w.app}:${w.id}`} className="admin-row">
                <span className={clsx('admin-icon-tile', w.fetched ? 'bg-emerald-500/15 text-emerald-400' : '')}>
                  {w.fetched ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-ndp-text truncate">
                    {w.title}
                    {w.year ? <span className="text-ndp-text-dim font-normal"> ({w.year})</span> : null}
                  </p>
                  <p className="text-xs text-ndp-text-dim mt-0.5">
                    {[
                      w.app === 'radarr' ? 'Radarr' : 'Sonarr',
                      w.seasons?.length ? t('admin.dmm.wanted_seasons', 'season(s) {{list}}', { list: w.seasons.join(', ') }) : t('admin.dmm.wanted_all', 'whole show'),
                      w.imdbId,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={clsx('admin-chip flex-shrink-0', w.fetched ? 'text-emerald-300' : '')}>
                  {w.fetched ? t('admin.dmm.wanted_state_fetched', 'fetched') : t('admin.dmm.wanted_state_wanted', 'wanted')}
                </span>
                <button
                  type="button"
                  onClick={() => setRemoveTarget(w)}
                  aria-label={t('admin.dmm.wanted_remove', 'Remove from the wanted list')}
                  title={t('admin.dmm.wanted_remove', 'Remove from the wanted list')}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {wanted?.truncated && (
          <p className="admin-hint">{t('admin.dmm.wanted_truncated', 'Showing the first {{n}} titles — use the search above to narrow it.', { n: wanted.items.length })}</p>
        )}
        <p className="admin-hint">{t('admin.dmm.wanted_hint', 'Read through DMM\u2019s Radarr/Sonarr API, so opening this page does not mark the list as polled by zurg. Removing a title leaves anything zurg already fetched alone.')}</p>
      </section>

      {error && <p className="px-1 text-sm text-ndp-danger">{error}</p>}

      {result && <ResultPanel result={result} onClose={() => setResult(null)} />}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h3 className="admin-group-label !mb-0 inline-flex items-center gap-2">
            <Database className="w-4 h-4" />{t('admin.dmm.backups_title', 'Backups')}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t('admin.dmm.filter', 'Filter by app')} className="input py-2 text-sm">
              <option value="all">{t('admin.dmm.filter_all', 'Both apps')}</option>
              <option value="radarr">Radarr</option>
              <option value="sonarr">Sonarr</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('admin.dmm.sort', 'Sort backups')} className="input py-2 text-sm">
              <option value="newest">{t('admin.dmm.sort_newest', 'Newest first')}</option>
              <option value="oldest">{t('admin.dmm.sort_oldest', 'Oldest first')}</option>
              <option value="largest">{t('admin.dmm.sort_largest', 'Largest first')}</option>
            </select>
          </div>
        </div>

        <div className="admin-group divide-y divide-white/[0.06]">
          {data.backups.map((list) => (
            <div key={list.app} className="admin-row">
              <span className={clsx('admin-icon-tile', list.error ? 'bg-amber-500/15 text-amber-300' : '')}>
                {list.error ? <AlertTriangle className="w-4 h-4" /> : <Database className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-ndp-text">{list.app === 'radarr' ? 'Radarr' : 'Sonarr'}</p>
                <p className="text-xs text-ndp-text-dim mt-0.5">
                  {list.error
                    ? list.error
                    : list.backups.length
                      ? t('admin.dmm.backup_count', '{{n}} backup(s) available', { n: list.backups.length })
                      : t('admin.dmm.no_backups', 'No backups yet. Radarr/Sonarr only makes them on schedule or on demand.')}
                </p>
              </div>
              <button type="button" onClick={() => void backupNow(list.app)} disabled={backingUp !== null} className="btn-secondary !px-3 !py-2 !text-sm flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50">
                {backingUp === list.app ? <Spinner size="sm" /> : <Clock className="w-4 h-4" />}
                {t('admin.dmm.backup_now', 'Back up now')}
              </button>
            </div>
          ))}
        </div>

        {rows.length > 0 ? (
          <div className="admin-group divide-y divide-white/[0.06] mt-3">
            {rows.map((b) => (
              <div key={`${b.app}:${b.name}`} className="admin-row">
                <span className="admin-icon-tile"><FileArchive className="w-4 h-4" /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-ndp-text break-all leading-snug">{b.name}</p>
                  <p className="text-xs text-ndp-text-dim mt-0.5">
                    {[b.app === 'radarr' ? 'Radarr' : 'Sonarr', fmtWhen(b.time), fmtSize(b.size), b.type].join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void importBackup(b)}
                  disabled={busy !== null || data.sponsor !== 'active'}
                  className="btn-secondary !px-3 !py-2 !text-sm disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                >
                  {busy === `${b.app}:${b.name}` ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
                  {t('admin.dmm.import', 'Import')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="admin-hint">{t('admin.dmm.no_rows', 'Nothing to list yet — make a backup, or import a zip below.')}</p>
        )}

        <p className="admin-hint">{t('admin.dmm.backup_note', 'The server downloads the chosen backup from Radarr/Sonarr itself — only the database inside it is forwarded to DMM, so the *arr API key never leaves this box.')}</p>
      </section>

      <section>
        <h3 className="admin-group-label">{t('admin.dmm.upload_title', 'Import a backup file')}</h3>
        <div className="admin-group">
          <div className="admin-row flex-wrap gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              aria-label={t('admin.dmm.choose', 'Choose a backup zip')}
              onChange={(e) => { setError(null); setResult(null); setFile(e.target.files?.[0] ?? null); }}
              disabled={uploading}
              className="block text-sm text-ndp-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-ndp-text hover:file:bg-white/15 disabled:opacity-50"
            />
            <button type="button" className="btn-primary flex items-center gap-2 !px-4" onClick={upload} disabled={!file || uploading || data.sponsor !== 'active'}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading
                ? t('admin.dmm.uploading', 'Importing{{progress}}', { progress: progress != null ? ` ${progress}%` : '…' })
                : t('admin.dmm.upload', 'Import to DMM')}
            </button>
            {file && (
              <p className="text-xs text-ndp-text-dim inline-flex items-center gap-1.5">
                <FileArchive className="w-3.5 h-3.5" />{file.name} · {fmtSize(file.size)}
              </p>
            )}
          </div>
        </div>
        <p className="admin-hint">{t('admin.dmm.upload_hint', 'For a backup that lives on another machine. Only the database inside the zip is sent.')}</p>
      </section>

      <section>
        <h3 className="admin-group-label">{t('admin.dmm.auto_title', 'Scheduled import')}</h3>
        <div className="admin-group">
          <button
            type="button"
            role="switch"
            aria-checked={data.autoImport?.enabled ?? false}
            disabled={busy === 'auto'}
            onClick={() => void toggleAuto(!(data.autoImport?.enabled ?? false))}
            className="admin-row w-full text-left hover:bg-white/[0.03] transition-colors disabled:opacity-50"
          >
            <span className="admin-icon-tile"><Clock className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-ndp-text">{t('admin.dmm.auto_row', 'Import each app’s newest backup once a day')}</p>
              <p className="text-xs text-ndp-text-dim mt-0.5">
                {data.autoImport?.enabled
                  ? t('admin.dmm.auto_on', 'On — imports each app’s newest backup once, daily.')
                  : t('admin.dmm.auto_off', 'Off — nothing is sent to DMM automatically.')}
                {data.autoImport?.lastRunAt && ` ${t('admin.dmm.auto_last', 'Last run: {{when}} ({{status}}).', { when: fmtWhen(data.autoImport.lastRunAt), status: data.autoImport.lastStatus ?? '—' })}`}
              </p>
            </div>
            <SwitchTrack on={data.autoImport?.enabled ?? false} />
          </button>
        </div>
        <p className="admin-hint">{t('admin.dmm.auto_hint', 'A backup already imported is skipped, so the job never re-sends the same archive. A new backup from the *arr is picked up on the next run.')}</p>
      </section>

      <section>
        <h3 className="admin-group-label">{t('admin.dmm.history_title', 'Recent imports')}</h3>
        {data.imports.length === 0 ? (
          <div className="admin-group">
            <div className="admin-row text-sm text-ndp-text-dim">{t('admin.dmm.history_empty', 'No imports yet.')}</div>
          </div>
        ) : (
          <div className="admin-group divide-y divide-white/[0.06]">
            {data.imports.map((row) => (
              <div key={row.id} className="admin-row">
                <span className="admin-icon-tile"><History className="w-4 h-4" /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ndp-text break-all leading-snug">{row.backupName}</p>
                  <p className="text-xs text-ndp-text-dim mt-0.5">
                    {[row.app === 'radarr' ? 'Radarr' : 'Sonarr', fmtWhen(row.createdAt), row.source].join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                  <span className="admin-chip">{t('admin.dmm.history_added', '+{{n}} added', { n: row.added })}</span>
                  <span className="admin-chip">{t('admin.dmm.history_already', '{{n}} already', { n: row.alreadyWanted })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="admin-group-label">{t('admin.dmm.zurg_title', 'What zurg has fetched')}</h3>
        {!data.zurg ? (
          <div className="admin-group">
            <div className="admin-row text-sm text-ndp-text-dim">{t('admin.dmm.zurg_unavailable', 'Zurg is not connected, so there is nothing to report.')}</div>
          </div>
        ) : data.zurg.sources.length === 0 ? (
          <div className="admin-group">
            <div className="admin-row text-sm text-ndp-text-dim">{t('admin.dmm.zurg_no_source', 'Zurg reports no DMM source. Point zurg at this sponsor key to fetch the wanted list.')}</div>
          </div>
        ) : (
          <div className="admin-group divide-y divide-white/[0.06]">
            <div className="admin-row">
              <span className="admin-icon-tile"><CheckCircle2 className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-ndp-text">
                  {t('admin.dmm.zurg_summary', '{{done}} fetched · {{retrying}} retrying · {{total}} jobs', {
                    done: data.zurg.counts.done ?? 0, retrying: data.zurg.counts.retrying ?? 0, total: data.zurg.total,
                  })}
                </p>
                <p className="text-xs text-ndp-text-dim mt-0.5">{data.zurg.sources.map((s) => s.name).join(' · ')}</p>
              </div>
            </div>
            {data.zurg.recent.slice(0, 8).map((job, i) => (
              <div key={`${job.item}-${i}`} className="admin-row items-start">
                <span className={clsx('admin-icon-tile', job.state === 'done' ? 'bg-emerald-500/15 text-emerald-400' : job.state === 'retrying' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-ndp-text-dim')}>
                  {job.state === 'done' ? <CheckCircle2 className="w-4 h-4" /> : job.state === 'retrying' ? <RefreshCw className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-ndp-text truncate">{job.item}</p>
                  <p className="text-xs text-ndp-text-dim mt-0.5 break-words">{[job.state, job.detail].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="text-[11px] text-ndp-text-dim whitespace-nowrap mt-0.5">{job.updatedAt ? fmtWhen(job.updatedAt) : ''}</span>
              </div>
            ))}
          </div>
        )}
        <p className="admin-hint">{t('admin.dmm.zurg_hint', 'Read from zurg’s own report. This page does not open DMM’s wanted list, because reading it marks the list as polled by zurg.')}</p>
      </section>


      <ConfirmModal
        open={removeTarget !== null}
        tone="danger"
        title={t('admin.dmm.wanted_remove_title', 'Remove from the DMM wanted list?')}
        description={removeTarget
          ? t('admin.dmm.wanted_remove_desc', '{{title}} stops being wanted. Anything zurg already fetched stays in your library.', { title: removeTarget.title })
          : undefined}
        confirmLabel={t('admin.dmm.wanted_remove', 'Remove from the wanted list')}
        onConfirm={() => { if (removeTarget) void removeWanted(removeTarget); }}
        onClose={() => setRemoveTarget(null)}
      />

      <p className="admin-hint">{t('admin.dmm.quality_note', 'DMM and zurg choose releases with zurg’s own acquisition settings, not your Radarr/Sonarr quality profiles. Imports only add titles — removing one in DMM does not remove it from Radarr or Sonarr.')}</p>
    </div>
  );
}

function ResultPanel({ result, onClose }: Readonly<{ result: ImportResult; onClose: () => void }>) {
  const { t } = useTranslation();
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h3 className="admin-group-label !mb-0 inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {t('admin.dmm.result_title', 'Imported the {{app}} backup', { app: result.app === 'radarr' ? 'Radarr' : 'Sonarr' })}
        </h3>
        <button type="button" onClick={onClose} className="btn-secondary !py-2 !px-3 text-sm">
          {t('common.close')}
        </button>
      </div>

      <div className="admin-group divide-y divide-white/[0.06]">
        {[
          ['admin.dmm.found', 'Found', result.found],
          ['admin.dmm.added', 'Added', result.added],
          ['admin.dmm.already', 'Already wanted', result.alreadyWanted],
          ['admin.dmm.no_imdb', 'No IMDb id', result.noImdbId],
          ['admin.dmm.not_available', 'Not released yet', result.notAvailable],
          ['admin.dmm.over_cap', 'Over the list cap', result.overCap],
        ].map(([key, label, value]) => (
          <div key={String(key)} className="admin-row">
            <span className="flex-1 min-w-0 text-sm text-ndp-text-muted">{t(String(key), String(label))}</span>
            <span className="font-display text-xl leading-none text-ndp-text tabular-nums">{String(value)}</span>
          </div>
        ))}
      </div>

      {result.seasonsTmdbLacks.length > 0 && (
        <div className="admin-group mt-3">
          <div className="admin-row items-start">
            <span className="admin-icon-tile bg-amber-500/15 text-amber-300"><AlertTriangle className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ndp-text">
                {t('admin.dmm.seasons_lacks', 'These Sonarr seasons have nothing aired on TMDB, so zurg will not fetch them:')}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-ndp-text-muted">
                {result.seasonsTmdbLacks.slice(0, 20).map((row) => (
                  <li key={row.title}>
                    {row.title} — {t('admin.dmm.seasons_list', 'season(s) {{list}}', { list: row.seasons.join(', ') })}
                  </li>
                ))}
              </ul>
              {result.seasonsTmdbLacks.length > 20 && (
                <p className="mt-1 text-[11px] text-ndp-text-dim">
                  {t('admin.dmm.seasons_more', 'and {{n}} more', { n: result.seasonsTmdbLacks.length - 20 })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
