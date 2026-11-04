import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, XCircle, RefreshCw, Pencil, Power, Webhook, Search, ChevronDown, ChevronRight } from 'lucide-react';
import cronstrue from 'cronstrue/i18n';
import i18n from '@/i18n';
import { localizedDateTime } from '@/i18n/formatters';
import api from '@/lib/api';
import { showToast as showGlobalToast, toastApiError, extractApiError } from '@/utils/toast';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useServiceSchemas, type ServiceData } from '@/hooks/useServiceSchemas';

interface CronJobData {
  id: number;
  key: string;
  label: string;
  cronExpression: string;
  enabled: boolean;
  pluginId: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDuration: number | null;
  lastResult: string | null;
  running?: boolean;
}

interface PluginInfoLite {
  id: string;
  name: string;
}



/** Extract the stored error text from a failed job's lastResult JSON (`{"error": ...}`).
 *  Returns null when the job didn't fail or nothing was recorded. */
function lastErrorText(job: CronJobData): string | null {
  if (job.lastStatus !== 'error' || !job.lastResult) return null;
  try {
    const parsed = JSON.parse(job.lastResult) as { error?: unknown };
    if (typeof parsed.error === 'string' && parsed.error) return parsed.error;
  } catch { /* not JSON, fall through to raw */ }
  return job.lastResult;
}

interface WebhookStatus {  serviceId: number;
  serviceName: string;
  serviceType: string;
  icon: string;
  enabled: boolean;
  serviceReachable: boolean;
  url: string;
  events: { key: string; label: string; description: string }[];
  supportsWebhooks: boolean;
}

export function JobsTab() {
  const { t } = useTranslation();
  const { schemas: SERVICE_SCHEMAS } = useServiceSchemas();
  const [jobs, setJobs] = useState<CronJobData[]>([]);
  const [pluginsById, setPluginsById] = useState<Map<string, PluginInfoLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editingCron, setEditingCron] = useState<{ key: string; value: string } | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookStatus[]>([]);
  const [webhookLoading, setWebhookLoading] = useState<number | null>(null);
  // Snapshot of lastRunAt taken when *this* client triggered the job — lets us detect
  // completion (lastRunAt advances + running goes false) and surface the result toast.
  const [triggered, setTriggered] = useState<Map<string, string | null>>(new Map());
  const [jobFilter, setJobFilter] = useState('');
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/jobs');
      setJobs(data);
    } catch (err) { toastApiError(err, t('admin.jobs.load_failed')); }
    finally { setLoading(false); }
  }, [t]);

  const fetchWebhooks = useCallback(async () => {
    try {
      const { data: services } = await api.get('/admin/services') as { data: ServiceData[] };
      const arrServices = services.filter(s => ['radarr', 'sonarr'].includes(s.type));
      setWebhooks([]);
      arrServices.forEach(async (svc) => {
        const schema = SERVICE_SCHEMAS[svc.type];
        try {
          const { data } = await api.get(`/admin/services/${svc.id}/webhook/status`);
          const status = { serviceId: svc.id, serviceName: svc.name, serviceType: svc.type, icon: schema?.icon || '', ...data } as WebhookStatus;
          setWebhooks(prev => [...prev.filter(w => w.serviceId !== svc.id), status]);
        } catch (err) {
          // If the probe itself fails (service down, 500, network), push a degraded tile so the
          // Webhooks section doesn't vanish when all services are unreachable — admin sees the
          // row with "unreachable" state instead of thinking webhooks aren't supported at all.
          console.error(`Webhook status probe failed for service ${svc.id}`, err);
          setWebhooks(prev => [...prev.filter(w => w.serviceId !== svc.id), {
            serviceId: svc.id,
            serviceName: svc.name,
            serviceType: svc.type,
            icon: schema?.icon || '',
            enabled: false,
            serviceReachable: false,
            url: '',
            events: [],
            supportsWebhooks: false,
          }]);
        }
      });
    } catch (err) { toastApiError(err, t('admin.jobs.webhooks_load_failed')); }
  }, [SERVICE_SCHEMAS, t]);

  const fetchPlugins = useCallback(async () => {
    try {
      const { data } = await api.get<PluginInfoLite[]>('/plugins');
      setPluginsById(new Map(data.map((p) => [p.id, p])));
    } catch { /* non-critical, UI falls back to raw pluginId */ }
  }, []);

  useEffect(() => { fetchJobs(); fetchWebhooks(); fetchPlugins(); }, [fetchJobs, fetchWebhooks, fetchPlugins]);

  const formatSyncResult = (data: Record<string, any>) => {
    const parts: string[] = [];
    if (data.radarr) {
      const r = data.radarr;
      if ('added' in r) parts.push(t('admin.jobs.toast.radarr_sync', { added: r.added, updated: r.updated, duration: (r.duration / 1000).toFixed(1) }));
      else if ('imported' in r) parts.push(t('admin.jobs.toast.radarr_requests', { imported: r.imported, skipped: r.skipped }) + (r.errors ? t('admin.jobs.toast.errors', { errors: r.errors }) : ''));
    }
    if (data.sonarr) {
      const s = data.sonarr;
      if ('added' in s) parts.push(t('admin.jobs.toast.sonarr_sync', { added: s.added, updated: s.updated, duration: (s.duration / 1000).toFixed(1) }));
      else if ('imported' in s) parts.push(t('admin.jobs.toast.sonarr_requests', { imported: s.imported, skipped: s.skipped }) + (s.errors ? t('admin.jobs.toast.errors', { errors: s.errors }) : ''));
    }
    return parts.join(', ') || JSON.stringify(data);
  };

  const runJob = async (key: string) => {
    const snapshot = jobs.find((j) => j.key === key)?.lastRunAt ?? null;
    try {
      await api.post(`/admin/jobs/${key}/run`);
      setTriggered((prev) => new Map(prev).set(key, snapshot));
      showGlobalToast(t('admin.jobs.job_started', { key }), 'success');
      fetchJobs();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        showGlobalToast(t('admin.jobs.job_already_running', { key }), 'error');
      } else {
        showGlobalToast(extractApiError(err, t('admin.jobs.job_failed', { key })), 'error');
      }
    }
  };

  // Poll while any job is mid-run (server-reported `running` flag, or one we just triggered
  // and haven't seen finish yet). 3s strikes a balance between responsive UI and not hammering
  // the admin endpoint.
  useEffect(() => {
    const anyActive = jobs.some((j) => j.running) || triggered.size > 0;
    if (!anyActive) return;
    const id = setInterval(fetchJobs, 3000);
    return () => clearInterval(id);
  }, [jobs, triggered, fetchJobs]);

  // Surface the result toast when a tracked job finishes.
  useEffect(() => {
    if (triggered.size === 0) return;
    const next = new Map(triggered);
    let changed = false;
    for (const [key, snapshot] of triggered) {
      const job = jobs.find((j) => j.key === key);
      if (!job || job.running) continue;
      if (job.lastRunAt && job.lastRunAt !== snapshot) {
        next.delete(key);
        changed = true;
        if (job.lastStatus === 'success') {
          let parsed: Record<string, unknown> | null = null;
          try { parsed = job.lastResult ? JSON.parse(job.lastResult) : null; } catch { /* ignore */ }
          if (parsed && (parsed.radarr || parsed.sonarr)) {
            showGlobalToast(formatSyncResult(parsed as Record<string, any>), 'success');
          } else if (parsed && typeof parsed.purged === 'number') {
            showGlobalToast(t('admin.jobs.purged_deleted', { count: parsed.purged }), 'success');
          } else {
            showGlobalToast(t('admin.jobs.job_done', { key }), 'success');
          }
        } else {
          showGlobalToast(t('admin.jobs.job_failed', { key }), 'error');
        }
      }
    }
    if (changed) setTriggered(next);
  }, [jobs, triggered, t]);

  const toggleJob = async (job: CronJobData) => {
    try {
      await api.put(`/admin/jobs/${job.key}`, { enabled: !job.enabled });
      fetchJobs();
    } catch (err) { toastApiError(err, t('admin.jobs.toggle_failed', { key: job.key })); }
  };

  const saveCron = async (key: string, cronExpression: string) => {
    try {
      await api.put(`/admin/jobs/${key}`, { cronExpression });
      setEditingCron(null);
      fetchJobs();
    } catch (err) { toastApiError(err, t('admin.jobs.schedule_save_failed', { key })); }
  };

  if (loading) return <Spinner />;

  const cronToHuman = (expr: string) => {
    try { return cronstrue.toString(expr, { locale: i18n.language, use24HourTimeFormat: true }); }
    catch { return null; }
  };
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <AdminTabLayout title={t('admin.jobs.header.job')} count={jobs.length}>

      {/* Jobs grouped by source: system (pluginId IS NULL) vs plugin-owned. */}
      {(() => {
        const q = jobFilter.trim().toLowerCase();
        const matches = (j: CronJobData) =>
          !q ||
          j.key.toLowerCase().includes(q) ||
          j.label.toLowerCase().includes(q) ||
          (j.label.startsWith('admin.jobs.labels.') && t(j.label).toLowerCase().includes(q)) ||
          (j.pluginId ?? '').toLowerCase().includes(q);
        const visibleJobs = jobs.filter(matches);
        const systemJobs = visibleJobs.filter((j) => !j.pluginId);
        const pluginJobs = visibleJobs.filter((j) => j.pluginId);
        const pluginGroups = new Map<string, CronJobData[]>();
        for (const j of pluginJobs) {
          const arr = pluginGroups.get(j.pluginId!) ?? [];
          arr.push(j);
          pluginGroups.set(j.pluginId!, arr);
        }
        const activeCount = jobs.filter((j) => j.enabled).length;
        const errorCount = jobs.filter((j) => j.lastStatus === 'error').length;
        const runningCount = jobs.filter((j) => j.running).length;
        return (
          <>
            {/* KPI row, 2×2 on phones, one row of four from sm up. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
              <KpiCard
                label={t('admin.jobs.kpi.total', 'Total')}
                value={jobs.length}
                hint={t('admin.jobs.kpi.total_breakdown', '{{system}} system · {{plugin}} plugin', { system: systemJobs.length, plugin: pluginJobs.length })}
              />
              <KpiCard
                label={t('admin.jobs.kpi.active', 'Active')}
                value={activeCount}
                tone="success"
              />
              <KpiCard
                label={t('admin.jobs.kpi.errors', 'Errors')}
                value={errorCount}
                tone={errorCount > 0 ? 'danger' : 'muted'}
              />
              <KpiCard
                label={t('admin.jobs.kpi.running', 'Running')}
                value={runningCount}
                tone={runningCount > 0 ? 'accent' : 'muted'}
              />
            </div>

            {/* Filter, full width on phones. */}
            <div className="relative w-full sm:w-72 mb-6">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ndp-text-dim pointer-events-none" />
              <input
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                placeholder={t('admin.jobs.filter_placeholder', 'Filter jobs...')}
                aria-label={t('admin.jobs.filter_placeholder', 'Filter jobs...')}
                className="input w-full text-sm pl-9 pr-3 py-2.5"
              />
            </div>

            {/* Two-column layout: system jobs left, plugin jobs right. Collapses to a
                single column below lg. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-6 items-start">
              <section>
                <SectionHeading label={t('admin.jobs.section.system', 'System jobs')} count={systemJobs.length} />
                {systemJobs.length > 0 && (
                  <div className="admin-group divide-y divide-white/[0.06]">
                    {systemJobs.map((job) => renderJob(job))}
                  </div>
                )}
              </section>

              <section>
                <SectionHeading label={t('admin.jobs.section.plugin', 'Plugin jobs')} count={pluginJobs.length} />
                {pluginGroups.size === 0 ? (
                  <div className="admin-group px-4 py-6 text-center text-sm text-ndp-text-dim">
                    {t('admin.jobs.section.plugin_empty', 'No plugin jobs installed.')}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {[...pluginGroups.entries()].map(([pid, list]) => {
                      const meta = pluginsById.get(pid);
                      return (
                        <div key={pid}>
                          <div className="admin-group-label flex items-center gap-2 normal-case tracking-normal text-xs font-medium text-ndp-text-muted">
                            <span className="truncate">{meta?.name ?? pid}</span>
                            <span className="admin-chip">{list.length}</span>
                          </div>
                          <div className="admin-group divide-y divide-white/[0.06]">
                            {list.map((job) => renderJob(job))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        );

        function renderJob(job: CronJobData) {
          const isEditing = editingCron?.key === job.key;
          return (
            <div key={job.key} className={clsx(!job.enabled && 'opacity-50')}>
              <div className="flex items-start gap-3 px-4 py-3 min-h-[52px]">
                {/* Status dot */}
                <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-[7px]',
                  !job.enabled ? 'bg-ndp-text-dim' :
                  job.lastStatus === 'success' ? 'bg-ndp-success' :
                  job.lastStatus === 'error' ? 'bg-ndp-danger' :
                  'bg-ndp-text-dim'
                )} />

                {/* Job info, title, schedule, then last-run metadata underneath. */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ndp-text break-words">
                      {job.label.startsWith('admin.jobs.labels.') ? t(job.label) : job.label}
                    </span>
                    {job.lastStatus && (
                      <span className={clsx('admin-chip',
                        job.lastStatus === 'success' ? 'bg-ndp-success/15 text-ndp-success' : 'bg-ndp-danger/15 text-ndp-danger'
                      )}>
                        {job.lastStatus === 'success' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {job.lastStatus === 'success' ? t('common.ok') : t('common.error')}
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editingCron.value}
                          onChange={(e) => setEditingCron({ key: job.key, value: e.target.value })}
                          className="input text-xs font-mono w-36 py-1.5 px-2.5"
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCron(job.key, editingCron.value); if (e.key === 'Escape') setEditingCron(null); }}
                          autoFocus
                        />
                        <button onClick={() => saveCron(job.key, editingCron.value)} className="w-10 h-10 flex items-center justify-center text-ndp-success hover:bg-ndp-success/10 rounded-lg transition-colors"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => setEditingCron(null)} className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:bg-white/5 rounded-lg transition-colors"><XCircle className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingCron({ key: job.key, value: job.cronExpression })} className="text-xs text-ndp-text-muted hover:text-ndp-accent transition-colors inline-flex items-start gap-1.5 text-left py-0.5">
                        <Pencil className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span className="break-words">{cronToHuman(job.cronExpression) || job.cronExpression}</span>
                      </button>
                    )}
                  </div>
                  {(job.lastRunAt || job.lastDuration !== null) && (
                    <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-0.5 text-[11px] text-ndp-text-dim">
                      {job.lastRunAt && (
                        <span title={localizedDateTime(job.lastRunAt)}>{localizedDateTime(job.lastRunAt)}</span>
                      )}
                      {job.lastRunAt && job.lastDuration !== null && <span aria-hidden>·</span>}
                      {job.lastDuration !== null && (
                        <span className="font-mono">{formatDuration(job.lastDuration)}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center flex-shrink-0 -mr-2 -my-1">
                  <button onClick={() => runJob(job.key)} disabled={!!job.running} className="w-10 h-10 flex items-center justify-center text-ndp-text-muted hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors disabled:cursor-not-allowed" title={t('admin.jobs.run')} aria-label={t('admin.jobs.run')}>
                    {job.running || triggered.has(job.key) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <button onClick={() => toggleJob(job)} className="w-10 h-10 flex items-center justify-center text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={job.enabled ? t('common.disable') : t('common.enable')} aria-label={job.enabled ? t('common.disable') : t('common.enable')}>
                    <Power className={clsx('w-4 h-4', job.enabled && 'text-ndp-success')} />
                  </button>
                </div>
              </div>
              {(() => {
                const errText = lastErrorText(job);
                if (!errText) return null;
                const expanded = expandedErrors.has(job.key);
                return (
                  <div className="pl-9 pr-4 pb-3 -mt-1">
                    <button
                      onClick={() => setExpandedErrors((prev) => {
                        const next = new Set(prev);
                        if (next.has(job.key)) next.delete(job.key);
                        else next.add(job.key);
                        return next;
                      })}
                      className="flex items-start gap-1.5 text-left w-full rounded-lg bg-ndp-danger/[0.06] px-2.5 py-2 text-ndp-danger/90 hover:text-ndp-danger"
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-px" />}
                      <span className={clsx('flex-1 min-w-0 text-[11px] font-mono', expanded ? 'whitespace-pre-wrap break-all' : 'truncate')}>
                        {errText}
                      </span>
                    </button>
                  </div>
                );
              })()}
            </div>
          );
        }
      })()}

      {/* Webhooks section */}
      {webhooks.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display-title text-2xl text-ndp-text">{t('admin.jobs.webhooks_title')}</h2>
          <p className="text-xs text-ndp-text-dim leading-relaxed mt-1.5 mb-4">{t('admin.jobs.webhooks_desc')}</p>

          <div className="admin-group divide-y divide-white/[0.06]">
            {webhooks.map(wh => (
              <div key={wh.serviceId} className={clsx('admin-row items-start', !wh.enabled && 'opacity-50')}>
                {/* Service icon */}
                <span className="admin-icon-tile">
                  {wh.icon ? (
                    <img src={wh.icon} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <Webhook className="w-4 h-4 text-ndp-text-dim" />
                  )}
                </span>

                {/* Name + event labels */}
                <div className="flex-1 min-w-0 pt-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ndp-text truncate">{wh.serviceName}</span>
                    {wh.enabled && !wh.serviceReachable && (
                      <span className="admin-chip bg-ndp-warning/15 text-ndp-warning">
                        {t('admin.services.unreachable')}
                      </span>
                    )}
                  </div>
                  {wh.supportsWebhooks && wh.events.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {wh.events.map(ev => (
                        <span
                          key={ev.key}
                          title={ev.description}
                          className={clsx(
                            'admin-chip font-medium cursor-default',
                            wh.enabled ? 'bg-ndp-success/15 text-ndp-success' : '',
                          )}
                        >
                          {ev.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Power toggle */}
                <button
                  onClick={async () => {
                    setWebhookLoading(wh.serviceId);
                    try {
                      if (wh.enabled) {
                        await api.post(`/admin/services/${wh.serviceId}/webhook/disable`);
                        showGlobalToast(t('admin.services.webhook_disabled_toast', { name: wh.serviceName }), 'info');
                      } else {
                        await api.post(`/admin/services/${wh.serviceId}/webhook/enable`);
                        showGlobalToast(t('admin.services.webhook_enabled_toast', { name: wh.serviceName }), 'success');
                      }
                      fetchWebhooks();
                    } catch (err) {
                      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
                      const base = extractApiError(err, t('admin.services.webhook_failed_toast'));
                      showGlobalToast(detail ? `${base}: ${detail}` : base, 'error');
                    } finally { setWebhookLoading(null); }
                  }}
                  disabled={webhookLoading === wh.serviceId}
                  className="w-10 h-10 -mr-2 -my-1 flex items-center justify-center text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
                  title={wh.enabled ? t('common.disable') : t('common.enable')}
                  aria-label={wh.enabled ? t('common.disable') : t('common.enable')}
                >
                  {webhookLoading === wh.serviceId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className={clsx('w-4 h-4', wh.enabled && 'text-ndp-success')} />}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent webhook events */}
      <WebhookEventLog />

    </AdminTabLayout>
  );
}

function SectionHeading({ label, count }: Readonly<{ label: string; count: number }>) {
  return (
    <div className="admin-group-label flex items-center gap-2">
      <h3>{label}</h3>
      <span className="tabular-nums text-ndp-text-dim/80">{count}</span>
    </div>
  );
}

function KpiCard({
  label, value, hint, tone = 'default',
}: Readonly<{
  label: string;
  value: number;
  hint?: string;
  tone?: 'default' | 'success' | 'danger' | 'accent' | 'muted';
}>) {
  const valueClass = {
    default: 'text-ndp-text',
    success: 'text-ndp-success',
    danger: 'text-ndp-danger',
    accent: 'text-ndp-accent',
    muted: 'text-ndp-text-dim',
  }[tone];
  return (
    <div className="admin-group px-3.5 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{label}</div>
      <div className={clsx('text-2xl font-semibold tabular-nums mt-1 leading-none', valueClass)}>{value}</div>
      {hint && <div className="text-[11px] text-ndp-text-dim mt-1.5 truncate">{hint}</div>}
    </div>
  );
}

function WebhookEventLog() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<{ id: number; createdAt: string; message: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/logs', { params: { label: 'Webhook', page: '1' } })
      .then(({ data }) => setEvents(data.results || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (events.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="font-display-title text-2xl text-ndp-text">{t('admin.jobs.webhook_log', 'Webhook Events')}</h2>
      <p className="text-xs text-ndp-text-dim leading-relaxed mt-1.5 mb-4">{t('admin.jobs.webhook_log_desc', 'Recent webhook events from Radarr/Sonarr.')}</p>
      <div className="admin-group divide-y divide-white/[0.06]">
        {events.map((ev) => (
          <div key={ev.id} className="px-4 py-3 flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-ndp-success mt-1.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ndp-text break-words">{ev.message}</p>
              <p className="text-[11px] text-ndp-text-dim mt-0.5">
                {new Date(ev.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
