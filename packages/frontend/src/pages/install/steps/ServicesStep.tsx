import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle, Loader2, RefreshCw, Trash2, X, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { startPlexPinFlow, type PlexPinFlowHandle } from '@/providers/plex/pinFlow';
import { PlexServerDiscovery } from '@/providers/plex/ServerDiscovery';
import api from '@/lib/api';
import { useServiceSchemas } from '@/hooks/useServiceSchemas';
import { useModal } from '@/hooks/useModal';
import { extractApiError } from '@/utils/toast';
import { WizardNav } from '../WizardNav';

interface WizardService {
  id?: number;
  type: string;
  config: Record<string, string>;
  testStatus: 'idle' | 'testing' | 'ok' | 'error';
  testError?: string;
  saved: boolean;
}

type Category = 'media-server' | 'arr' | 'download-client' | 'indexer' | 'monitoring';

// Display order is a UI decision — categories are presented required-first. The set of
// "required" categories is derived at runtime from the schemas (whichever connector marks
// `requiredForInstall: true` pulls its category into the required set), so adding a new
// required connector backend-side automatically gates the wizard with no frontend edit.
// LeMedia's wizard only asks for Radarr and/or Sonarr; a media server, download clients and
// indexers are optional and added later under Admin → Services.
const CATEGORY_ORDER: Category[] = ['arr'];

const CATEGORY_LABEL_KEY: Record<Category, string> = {
  'media-server': 'install.services.cat_media_server',
  'arr': 'install.services.cat_arr',
  'download-client': 'install.services.cat_download',
  'indexer': 'install.services.cat_indexer',
  'monitoring': 'install.services.cat_monitoring',
};

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export default function ServicesStep({ onNext, onBack }: Readonly<Props>) {
  const { t } = useTranslation();
  const { schemas: SERVICE_SCHEMAS } = useServiceSchemas('/setup/service-schemas', true);
  const [services, setServices] = useState<Record<string, WizardService>>({});
  const [editingType, setEditingType] = useState<string | null>(null);
  const [plexPolling, setPlexPolling] = useState<string | null>(null);
  const [plexDiscoveryToken, setPlexDiscoveryToken] = useState<string | null>(null);
  const [showPlexFields, setShowPlexFields] = useState(false);
  const [plexManualHint, setPlexManualHint] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestMode, setRequestMode] = useState<'arr' | 'dmm'>('arr');
  const [error, setError] = useState('');
  const flowRef = useRef<PlexPinFlowHandle | null>(null);

  // A refreshed wizard used to restart from an empty form while the services it had already saved
  // were still in the database, so configuring them again produced duplicates. Reload what exists.
  useEffect(() => {
    void api.get<{ id: number; type: string; config: Record<string, string> }[]>('/setup/services')
      .then(({ data }) => {
        if (data.length === 0) return;
        if (data.some(svc => svc.type === 'dmm' && svc.config.routeRequests === 'true')) setRequestMode('dmm');
        setServices((prev) => {
          const next = { ...prev };
          for (const svc of data) {
            // Never clobber something the user is mid-way through typing in this session.
            if (next[svc.type]) continue;
            next[svc.type] = { id: svc.id, type: svc.type, config: svc.config, testStatus: 'idle', saved: true };
          }
          return next;
        });
      })
      .catch(() => { /* fresh install, or the endpoint is unreachable, start empty */ });
  }, []);

  const closeModal = () => {
    flowRef.current?.cancel();
    setPlexPolling(null);
    setPlexDiscoveryToken(null);
    setShowPlexFields(false);
    setPlexManualHint(false);
    setError('');
    setServices((prev) => {
      if (!editingType) return prev;
      const next = { ...prev };
      if (Object.values(next[editingType]?.config || {}).every((v) => !v)) delete next[editingType];
      return next;
    });
    setEditingType(null);
  };

  const { dialogRef, titleId } = useModal({ open: editingType !== null, onClose: closeModal });

  useEffect(() => () => flowRef.current?.cancel(), []);

  const blankFor = (type: string): WizardService => {
    const schema = SERVICE_SCHEMAS[type];
    const config: Record<string, string> = {};
    schema?.fields.forEach((f) => { config[f.key] = ''; });
    return { type, config, testStatus: 'idle', saved: false };
  };

  const isPristine = (svc: WizardService | undefined) =>
    !svc || Object.values(svc.config).every((v) => !v);

  const selectTile = (type: string) => {
    // Drop the previously-edited service if user never touched it — keeps tiles tidy.
    setServices((prev) => {
      const next = { ...prev };
      if (editingType && editingType !== type && isPristine(next[editingType])) {
        delete next[editingType];
      }
      if (!next[type]) next[type] = blankFor(type);
      return next;
    });
    setEditingType(editingType === type ? null : type);
  };

  const updateService = (type: string, updates: Partial<WizardService>) => {
    setServices((prev) => {
      const cur = prev[type];
      if (!cur) return prev;
      const next = { ...cur, ...updates };
      if (updates.config) { next.testStatus = 'idle'; next.saved = false; }
      return { ...prev, [type]: next };
    });
  };

  const removeService = (type: string) => {
    setServices((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
    if (editingType === type) setEditingType(null);
  };

  const testService = async (type: string) => {
    const svc = services[type];
    if (!svc) return;
    updateService(type, { testStatus: 'testing', testError: undefined });
    try {
      await api.post('/setup/test-service', { type: svc.type, config: svc.config });
      updateService(type, { testStatus: 'ok', testError: undefined });
    } catch (err) {
      const resp = (err as { response?: { data?: { error?: string; detail?: string } } }).response?.data;
      const message = resp?.detail || resp?.error || (err as Error)?.message || 'Test failed';
      updateService(type, { testStatus: 'error', testError: message });
    }
  };

  const startPlexOAuth = (type: string) => {
    setPlexPolling(type);
    setError('');
    const authWindow = window.open('about:blank', 'PlexAuth', 'width=600,height=700');
    if (!authWindow) { setPlexPolling(null); setError(t('plex.discovery.popup_blocked')); return; }
    flowRef.current?.cancel();
    setPlexDiscoveryToken(null);
    flowRef.current = startPlexPinFlow({
      authWindow,
      pinEndpoint: '/setup/plex-pin',
      checkEndpoint: '/setup/plex-check',
      extractToken: (res) => (res as { token?: string })?.token ?? null,
      onToken: (token) => {
        setPlexPolling(null);
        setPlexDiscoveryToken(token);
      },
      onError: () => {
        setPlexPolling(null);
        setError(t('login.expired'));
      },
    });
  };

  const detectPlexMachineId = async (type: string) => {
    const svc = services[type];
    if (!svc?.config.url || !svc?.config.token) return;
    try {
      const { data } = await api.post<{ machineId: string }>('/setup/plex-identity', {
        url: svc.config.url, token: svc.config.token,
      });
      if (data.machineId) {
        updateService(type, { config: { ...svc.config, machineId: data.machineId } });
      }
    } catch { /* manual retry */ }
  };

  const saveAndContinue = async () => {
    setSaving(true);
    setError('');
    try {
      for (const svc of Object.values(services)) {
        if (svc.type !== 'dmm' && (svc.saved || svc.testStatus !== 'ok')) continue;
        if (svc.type === 'dmm' && !svc.saved && svc.testStatus !== 'ok') continue;
        const schema = SERVICE_SCHEMAS[svc.type];
        const { data } = await api.post<{ service: { id: number } }>('/setup/service', { name: schema?.label || svc.type, type: svc.type, config: svc.type === 'dmm' ? { ...svc.config, routeRequests: requestMode === 'dmm' ? 'true' : 'false' } : svc.config, ...(svc.id ? { serviceId: svc.id } : {}) });
        updateService(svc.type, { saved: true, id: data.service.id });
      }
      onNext();
    } catch (err) {
      setError(extractApiError(err, t('common.error')));
    } finally { setSaving(false); }
  };

  const requiredCategories = new Set<Category>(
    Object.values(SERVICE_SCHEMAS)
      .filter((s) => s.requiredForInstall)
      .map((s) => s.category as Category),
  );

  const groupedByCategory = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      required: requiredCategories.has(cat),
      types: Object.values(SERVICE_SCHEMAS)
        .filter((s) => s.category === cat && (requestMode === 'dmm' ? s.id === 'dmm' : s.id !== 'dmm'))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((s) => s.id),
    }))
    .filter((g) => g.types.length > 0);

  // Validation: every required category must have at least one service that tests OK.
  const okTypes = new Set(Object.values(services).filter((s) => s.testStatus === 'ok').map((s) => s.type));
  const missingRequired = [...requiredCategories].filter((cat) =>
    !Object.values(SERVICE_SCHEMAS).some((s) => s.category === cat && s.id !== 'dmm' && okTypes.has(s.id)),
  );
  const canContinue = (requestMode === 'dmm' ? okTypes.has('dmm') : missingRequired.length === 0 && requiredCategories.size > 0) && !plexPolling && !plexDiscoveryToken;
  const editingSvc = editingType ? services[editingType] : null;
  const editingSchema = editingType ? SERVICE_SCHEMAS[editingType] : null;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold text-ndp-text">{t('install.services.title')}</h2>
        <p className="text-sm text-ndp-text-muted">{t('install.services.desc')}</p>
      </header>

      <label className="block text-sm text-ndp-text">Request destination
        <select className="input w-full mt-2" value={requestMode} onChange={e => setRequestMode(e.target.value as 'arr' | 'dmm')}>
          <option value="arr">Radarr / Sonarr</option><option value="dmm">DMM Want</option>
        </select>
      </label>
      {groupedByCategory.map((group) => (
        <section key={group.category} className="space-y-2">
          <div className="flex items-center gap-2 px-0.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ndp-text-dim">
              {t(CATEGORY_LABEL_KEY[group.category])}
            </h3>
            {group.required && (
              <span className="text-[10px] uppercase tracking-wider text-ndp-warning bg-ndp-warning/10 px-1.5 py-0.5 rounded">
                {t('install.services.required_pill')}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {group.types.map((type) => {
          const schema = SERVICE_SCHEMAS[type];
          const svc = services[type];
          const isEditing = editingType === type;
          const isOk = svc?.testStatus === 'ok';
          const isError = svc?.testStatus === 'error';
          // "Started" = user actually typed something. A freshly-clicked tile with no
          // input doesn't deserve a warning indicator — show it as idle until there's content.
          const isStarted = !!svc && !isPristine(svc);
          let subtitle = '';
          let subtitleClass = 'text-ndp-text-dim';
          if (isOk) {
            subtitle = svc.config.url || t('status.connected');
            subtitleClass = 'text-ndp-success/80';
          } else if (isError) {
            subtitle = t('status.connection_failed');
            subtitleClass = 'text-ndp-danger/80';
          } else if (isStarted) {
            subtitle = t('install.services.tile_draft');
            subtitleClass = 'text-ndp-warning/90';
          }
          return (
            <button
              key={type}
              type="button"
              onClick={() => selectTile(type)}
              className={clsx(
                'group relative flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border transition-all text-center min-h-[110px]',
                isEditing
                  ? 'border-ndp-accent bg-ndp-accent/5 ring-2 ring-ndp-accent/20'
                  : isOk
                    ? 'border-ndp-success/30 bg-ndp-success/5 hover:bg-ndp-success/10'
                    : isError
                      ? 'border-ndp-danger/30 bg-ndp-danger/5 hover:bg-ndp-danger/10'
                      : isStarted
                        ? 'border-ndp-warning/30 bg-ndp-warning/5 hover:bg-ndp-warning/10'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/15',
              )}
            >
              {schema?.icon && <img src={schema.icon} alt="" className="w-8 h-8 object-contain" />}
              <span className={clsx(
                'text-xs font-medium leading-tight',
                isOk ? 'text-ndp-success' : isStarted ? 'text-ndp-text' : 'text-ndp-text-muted',
              )}>
                {schema?.label || type}
              </span>
              <span className={clsx('text-[10px] leading-tight truncate max-w-full', subtitleClass)}>
                {subtitle}
              </span>
              {isOk ? (
                <CheckCircle className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-ndp-success" />
              ) : isError ? (
                <XCircle className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-ndp-danger" />
              ) : isStarted ? (
                <Circle className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-ndp-warning" />
              ) : null}
            </button>
          );
            })}
          </div>
        </section>
      ))}

      {editingSvc && editingSchema && editingType && createPortal(
        <div
          className="modal-overlay z-50"
          onMouseDown={closeModal}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="modal-panel p-6 w-full max-w-md space-y-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {editingSchema.icon && <img src={editingSchema.icon} alt="" className="w-6 h-6 object-contain" />}
              <h3 id={titleId} className="text-base font-semibold text-ndp-text">{editingSchema.label}</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { removeService(editingType); setEditingType(null); }}
                className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
                aria-label={t('common.delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {editingType === 'plex' && <div className="space-y-2">
            <button type="button" onClick={() => startPlexOAuth(editingType)} disabled={plexPolling === editingType} className="btn-secondary w-full text-sm flex items-center justify-center gap-2 py-2.5 disabled:opacity-60">
              {plexPolling === editingType && <Loader2 className="w-4 h-4 animate-spin" />}
              {plexPolling === editingType ? t('login.waiting') : t('plex.discovery.sign_in')}
            </button>
            {plexDiscoveryToken && <PlexServerDiscovery accountToken={plexDiscoveryToken} endpointPrefix="/setup" onCancel={() => setPlexDiscoveryToken(null)} onConnected={(connection) => {
              setServices((prev) => {
                const current = prev[editingType];
                return current ? { ...prev, [editingType]: { ...current, config: { ...current.config, ...connection }, testStatus: 'ok', testError: undefined, saved: false } } : prev;
              });
              setPlexDiscoveryToken(null);
              setPlexManualHint(false);
            }} onManual={(token) => {
              setServices((prev) => {
                const current = prev[editingType];
                return current ? { ...prev, [editingType]: { ...current, config: { ...current.config, token, accountToken: token }, testStatus: 'idle', saved: false } } : prev;
              });
              setPlexDiscoveryToken(null);
              setShowPlexFields(true);
              setPlexManualHint(true);
            }} />}
            <button type="button" onClick={() => setShowPlexFields((visible) => !visible)} className="text-xs text-ndp-text-muted hover:text-ndp-text" aria-expanded={showPlexFields}>{showPlexFields ? t('plex.discovery.hide_manual') : t('plex.discovery.show_manual')}</button>
            {plexManualHint && <p className="text-xs text-ndp-text-muted">{t('plex.discovery.manual_hint')}</p>}
          </div>}

          <div className={editingType === 'plex' && !showPlexFields ? 'hidden' : 'space-y-4'}>
          {editingSchema.fields.map((field) => {
            const value = editingSvc.config[field.key] || '';
            if (field.helper === 'plex-oauth') {
              return (
                <div key={field.key}>
                  <input
                    type={field.type}
                    value={value}
                    onChange={(e) => updateService(editingType, { config: { ...editingSvc.config, [field.key]: e.target.value, accountToken: '' } })}
                    placeholder={t(field.labelKey)}
                    className="input w-full text-sm"
                  />
                </div>
              );
            }
            if (field.helper === 'plex-detect-machine-id') {
              return (
                <div key={field.key} className="flex gap-2">
                  <input
                    type={field.type}
                    value={value}
                    onChange={(e) => updateService(editingType, { config: { ...editingSvc.config, [field.key]: e.target.value } })}
                    placeholder={t(field.labelKey)}
                    className="input flex-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => detectPlexMachineId(editingType)}
                    disabled={!editingSvc.config.url || !editingSvc.config.token}
                    className="btn-secondary text-sm flex items-center gap-1.5 px-3"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }
            return (
              <input
                key={field.key}
                type={field.type}
                value={value}
                onChange={(e) => updateService(editingType, { config: { ...editingSvc.config, [field.key]: e.target.value } })}
                placeholder={field.placeholder || t(field.labelKey)}
                className="input w-full text-sm"
              />
            );
          })}
          </div>

          {error && <p className="text-xs text-ndp-danger">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => testService(editingType)}
              disabled={editingSvc.testStatus === 'testing' || !!plexPolling || !!plexDiscoveryToken}
              className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5"
            >
              {editingSvc.testStatus === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {t('common.test')}
            </button>
            {editingSvc.testStatus === 'ok' && (
              <span className="flex items-center gap-1 text-xs text-ndp-success">
                <CheckCircle className="w-3.5 h-3.5" />
                {t('status.connected')}
              </span>
            )}
            {editingSvc.testStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-ndp-danger">
                <XCircle className="w-3.5 h-3.5" />
                {t('status.connection_failed')}
              </span>
            )}
          </div>
          {editingSvc.testStatus === 'error' && editingSvc.testError && (
            <p className="text-xs text-ndp-danger/90 break-words">{editingSvc.testError}</p>
          )}

          <div className="flex justify-end pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={closeModal}
              className="btn-primary text-sm"
            >
              {editingSvc.testStatus === 'ok' ? t('common.done') : t('common.close')}
            </button>
          </div>
          </div>
        </div>,
        document.body,
      )}

      {requestMode === 'arr' && !canContinue && missingRequired.length > 0 && (
        <p className="text-xs text-ndp-text-dim">
          {t('install.services.required_missing', {
            categories: missingRequired.map((c) => t(CATEGORY_LABEL_KEY[c])).join(', '),
          })}
        </p>
      )}

      {error && !editingType && <div className="text-xs px-3 py-2 rounded-lg bg-ndp-danger/10 text-ndp-danger">{error}</div>}

      <WizardNav onBack={onBack} onNext={saveAndContinue} nextDisabled={!canContinue} nextLoading={saving} />
    </div>
  );
}
