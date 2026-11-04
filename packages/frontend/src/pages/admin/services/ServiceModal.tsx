import { useMemo, useState, useId, useEffect, useRef } from 'react';
import { startPlexPinFlow, type PlexPinFlowHandle } from '@/providers/plex/pinFlow';
import { PlexServerDiscovery } from '@/providers/plex/ServerDiscovery';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { Check, ChevronsUpDown, Copy, Eye, EyeOff, Loader2, Plug, RefreshCw, Save } from 'lucide-react';
import { AdminPasswordModal } from '@/components/AdminPasswordModal';
import { copyToClipboard } from '@/utils/clipboard';
import { SERVICE_SAVED_EVENT } from '@/pages/admin/EncryptionUpgradeBanner';
import api from '@/lib/api';
import { toastApiError, showToast } from '@/utils/toast';
import { useServiceSchemas, type ServiceData } from '@/hooks/useServiceSchemas';
import { useModal } from '@/hooks/useModal';

/** Mirrors backend MASK — resubmitting this value tells the backend to keep the stored secret. */
const MASK = '__MASKED__';

interface ServiceModalProps {
  service: ServiceData | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Create / edit form for a service. Dynamic fields driven by the service schema, with two
 *  Plex-specific helpers (fetch saved token from the admin's linked account, auto-detect the
 *  server's machineIdentifier via /identity). */
export function ServiceModal({ service, onClose, onSaved }: ServiceModalProps) {
  const { t } = useTranslation();
  const { schemas: SERVICE_SCHEMAS } = useServiceSchemas();
  const isEdit = !!service;
  const fieldId = useId();
  const { dialogRef, titleId } = useModal({ open: true, onClose });
  const [type, setType] = useState(service?.type || 'radarr');
  const [name, setName] = useState(service?.name || '');
  const [config, setConfig] = useState<Record<string, string>>(service?.config || {});
  const [isDefault, setIsDefault] = useState(service?.isDefault || false);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [fetchingPlexToken, setFetchingPlexToken] = useState(false);
  const [plexDiscoveryToken, setPlexDiscoveryToken] = useState<string | null>(null);
  const [plexConnected, setPlexConnected] = useState(false);
  const [showPlexFields, setShowPlexFields] = useState(false);
  const [detectingMachineId, setDetectingMachineId] = useState(false);
  const [modalError, setModalError] = useState('');
  const [typeQuery, setTypeQuery] = useState('');

  const schema = SERVICE_SCHEMAS[type];

  const filteredSchemas = useMemo(() => {
    const all = Object.entries(SERVICE_SCHEMAS);
    const q = typeQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(([key, s]) => s.label.toLowerCase().includes(q) || key.toLowerCase().includes(q));
  }, [typeQuery, SERVICE_SCHEMAS]);

  const handleConfigChange = (key: string, value: string) => {
    if (type === 'plex') setPlexConnected(false);
    setConfig((prev) => ({ ...prev, [key]: value, ...(type === 'plex' && key === 'token' ? { accountToken: '' } : {}) }));
  };

  // Secret-revealing actions go through AdminPasswordModal — `pwdPrompt` tracks which field we
  // were about to act on, the modal collects the admin password, and onSubmit dispatches based
  // on `kind`. Replaces the legacy `globalThis.prompt()` flow which leaked the prompt as a
  // browser-native dialog and could not be styled or made accessible.
  const [pwdPrompt, setPwdPrompt] = useState<{ kind: 'reveal' | 'copy'; fieldKey: string } | null>(null);

  // Re-mask a revealed secret after AUTO_REMASK_MS so a momentarily exposed credential doesn't
  // sit on screen indefinitely. Cleared if the user closes the modal in between.
  const AUTO_REMASK_MS = 8_000;
  const remaskTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => {
    Object.values(remaskTimers.current).forEach((id) => clearTimeout(id));
  }, []);

  const scheduleRemask = (key: string) => {
    if (remaskTimers.current[key]) clearTimeout(remaskTimers.current[key]);
    remaskTimers.current[key] = setTimeout(() => {
      setShowSecrets((prev) => ({ ...prev, [key]: false }));
      // Restore the placeholder value so the input visually re-masks instead of showing the
      // plain value as obscured dots.
      handleConfigChange(key, MASK);
      delete remaskTimers.current[key];
    }, AUTO_REMASK_MS);
  };

  const handlePwdSubmit = async (password: string): Promise<boolean> => {
    if (!service || !pwdPrompt) return false;
    const { kind, fieldKey } = pwdPrompt;
    try {
      const { data } = await api.post(`/admin/services/${service.id}/config/reveal`, { password });
      const value = data?.config?.[fieldKey];
      if (typeof value !== 'string') return false;

      if (kind === 'reveal') {
        handleConfigChange(fieldKey, value);
        setShowSecrets((prev) => ({ ...prev, [fieldKey]: true }));
        scheduleRemask(fieldKey);
      } else {
        const ok = await copyToClipboard(value);
        if (ok) showToast(t('common.copied'), 'success');
        else showToast(t('admin.services.copy_failed'), 'error');
      }
      return true;
    } catch (err) {
      // Fall through — the modal stays open with an inline "invalid" hint. We still log so a
      // server-side outage doesn't masquerade as a bad password.
      console.warn('[reveal] failed', err);
      return false;
    }
  };

  const flowRef = useRef<PlexPinFlowHandle | null>(null);
  useEffect(() => () => flowRef.current?.cancel(), []);

  const fetchPlexToken = () => {
    setModalError('');
    setFetchingPlexToken(true);
    // Popup must open synchronously on the user gesture or Safari blocks it.
    const authWindow = window.open('about:blank', 'PlexAuth', 'width=600,height=700');
    if (!authWindow) {
      setFetchingPlexToken(false);
      setModalError(t('plex.discovery.popup_blocked'));
      return;
    }
    flowRef.current?.cancel();
    setPlexDiscoveryToken(null);
    setPlexConnected(false);
    flowRef.current = startPlexPinFlow({
      authWindow,
      pinEndpoint: '/admin/plex-pin',
      checkEndpoint: '/admin/plex-check',
      extractToken: (res) => (res as { token?: string })?.token ?? null,
      onToken: (token) => {
        setFetchingPlexToken(false);
        setPlexDiscoveryToken(token);
      },
      onError: () => {
        setFetchingPlexToken(false);
        setModalError(t('admin.services.plex_token_error'));
      },
    });
  };

  const detectMachineId = async () => {
    const url = config.url;
    const token = config.token;
    if (!url || !token) return;
    setDetectingMachineId(true);
    try {
      // Proxied via backend — CSP connect-src 'self' blocks a direct fetch to the LAN Plex URL.
      const { data } = await api.post<{ machineId: string }>('/admin/plex-identity', { url: String(url), token: String(token) });
      if (data.machineId) handleConfigChange('machineId', data.machineId);
    } catch (err) { toastApiError(err, t('admin.services.detect_machine_id_failed')); }
    finally { setDetectingMachineId(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/admin/services/${service.id}`, { name, config, isDefault });
      } else {
        await api.post('/admin/services', { name, type, config, isDefault });
      }
      // Notify the encryption-upgrade banner so it can refetch and disappear if every service
      // has been re-saved through the encrypted write path.
      window.dispatchEvent(new CustomEvent(SERVICE_SAVED_EVENT));
      onSaved();
    } catch (err) { toastApiError(err, t(isEdit ? 'admin.services.save_failed' : 'admin.services.create_failed')); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div className="modal-overlay z-50" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel px-5 pt-6 pb-5 sm:p-6 w-full max-w-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-ndp-text mb-5">{isEdit ? t('admin.services.edit_title') : t('admin.services.add_title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label htmlFor={`${fieldId}-type`} className="text-xs font-medium text-ndp-text-muted mb-1.5 block">{t('admin.services.service_type')}</label>
              <Combobox
                value={type}
                onChange={(v: string | null) => {
                  if (!v) return;
                  setType(v);
                  setConfig({});
                  setPlexDiscoveryToken(null);
                  setPlexConnected(false);
                  flowRef.current?.cancel();
                  setFetchingPlexToken(false);
                  setTypeQuery('');
                }}
                immediate
              >
                <div className="relative">
                  {schema && (
                    <img
                      src={schema.icon}
                      alt=""
                      aria-hidden
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
                    />
                  )}
                  <ComboboxInput
                    id={`${fieldId}-type`}
                    className="input w-full pl-9 pr-9"
                    displayValue={(val: string) => SERVICE_SCHEMAS[val]?.label ?? val}
                    onChange={(e) => setTypeQuery(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder={t('admin.services.service_picker_search')}
                  />
                  <ComboboxButton className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-ndp-text-muted hover:text-ndp-text">
                    <ChevronsUpDown size={16} aria-hidden />
                  </ComboboxButton>
                  <ComboboxOptions
                    className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-white/[0.08] bg-ndp-surface py-1 shadow-[0_12px_32px_rgba(0,0,0,0.6)] focus:outline-none"
                  >
                    {filteredSchemas.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-ndp-text-muted">
                        {t('admin.services.service_picker_empty')}
                      </div>
                    ) : (
                      filteredSchemas.map(([key, s]) => (
                        <ComboboxOption
                          key={key}
                          value={key}
                          className="group flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] cursor-pointer text-sm data-[focus]:bg-white/[0.06]"
                        >
                          <img src={s.icon} alt="" aria-hidden className="w-5 h-5 shrink-0" />
                          <span className="flex-1 min-w-0 truncate text-ndp-text">{s.label}</span>
                          {s.untested && (
                            <span className="admin-chip bg-amber-500/15 text-amber-300 uppercase tracking-wide text-[10px] flex-shrink-0">
                              {t('admin.services.untested_pill')}
                            </span>
                          )}
                          <Check size={14} className="text-ndp-accent invisible group-data-[selected]:visible" aria-hidden />
                        </ComboboxOption>
                      ))
                    )}
                  </ComboboxOptions>
                </div>
              </Combobox>
              {schema?.untested && (
                <p className="mt-2 text-xs leading-relaxed text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  {t('admin.services.untested_notice')}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor={`${fieldId}-name`} className="text-xs font-medium text-ndp-text-muted mb-1.5 block">{t('common.name')}</label>
            <input id={`${fieldId}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${schema?.label || type} Principal`} className="input w-full" required />
          </div>

          {type === 'plex' && (
            <div className="space-y-2">
              <button type="button" onClick={fetchPlexToken} disabled={fetchingPlexToken} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm py-2.5 disabled:opacity-60">
                {fetchingPlexToken ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                {fetchingPlexToken ? t('login.waiting') : t('plex.discovery.sign_in')}
              </button>
              {modalError && <p className="text-xs text-ndp-danger">{modalError}</p>}
              {plexConnected && <p className="text-xs text-ndp-success">{t('plex.discovery.ready_save')}</p>}
              {plexDiscoveryToken && <PlexServerDiscovery accountToken={plexDiscoveryToken} endpointPrefix="/admin" onCancel={() => setPlexDiscoveryToken(null)} onConnected={(connection) => {
                setConfig((prev) => ({ ...prev, ...connection }));
                setName((prev) => prev.trim() ? prev : 'Plex');
                setPlexDiscoveryToken(null);
                setPlexConnected(true);
              }} onManual={(token) => {
                setConfig((prev) => ({ ...prev, token, accountToken: token }));
                setPlexDiscoveryToken(null);
                setShowPlexFields(true);
                setModalError(t('plex.discovery.manual_hint'));
              }} />}
              <button type="button" onClick={() => setShowPlexFields((visible) => !visible)} className="text-xs text-ndp-text-muted hover:text-ndp-text" aria-expanded={showPlexFields}>
                {showPlexFields ? t('plex.discovery.hide_manual') : t('plex.discovery.show_manual')}
              </button>
            </div>
          )}

          <div className={type === 'plex' && !showPlexFields ? 'hidden' : 'space-y-4'}>
          {schema?.fields.map((field) => {
            const isMasked = field.type === 'password' && config[field.key] === MASK;
            return (
            <div key={field.key}>
              <label htmlFor={`${fieldId}-${field.key}`} className="text-xs font-medium text-ndp-text-muted mb-1.5 block">{t(field.labelKey)}</label>
              <div className="relative">
                <input
                  id={`${fieldId}-${field.key}`}
                  type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                  value={isMasked ? '' : (config[field.key] || '')}
                  onChange={(e) => handleConfigChange(field.key, e.target.value)}
                  placeholder={isMasked ? t('admin.services.secret_stored') : field.placeholder}
                  className="input w-full pr-20"
                />
                {field.type === 'password' && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                    {isEdit && isMasked && (
                      <button
                        type="button"
                        onClick={() => setPwdPrompt({ kind: 'copy', fieldKey: field.key })}
                        className="w-9 h-9 flex items-center justify-center rounded-md text-ndp-text-dim hover:text-ndp-text"
                        title={t('common.copy')}
                        aria-label={t('common.copy')}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (isMasked) {
                          setPwdPrompt({ kind: 'reveal', fieldKey: field.key });
                        } else {
                          setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }));
                        }
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-md text-ndp-text-dim hover:text-ndp-text"
                      aria-label={showSecrets[field.key] ? t('common.hide') : t('common.show')}
                    >
                      {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
              {type === 'plex' && field.key === 'machineId' && (
                <button
                  type="button"
                  onClick={detectMachineId}
                  disabled={detectingMachineId || !config.url || !config.token}
                  className="mt-1 py-1.5 text-xs font-medium text-ndp-accent hover:text-ndp-accent-hover flex items-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  {detectingMachineId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {t('admin.services.auto_detect')}
                </button>
              )}
            </div>
            );
          })}
          </div>

          {type === 'rex' && <div className="text-xs text-ndp-text-dim space-y-2">
            <p>Test the saved service from the Services page, or check the library from the REX host. If your server requires a token, set REX_TOKEN first.</p>
            <code className="block rounded bg-black/20 p-2 break-all select-all">{'curl -H "Accept: application/json" -H "X-Plex-Token: $REX_TOKEN" "$REX_URL/library/sections"'}</code>
            <p>Set REX_URL to the address entered above, for example http://127.0.0.1:32400.</p>
          </div>}

          <label className="flex items-center gap-3 min-h-[44px] px-3 rounded-lg bg-ndp-surface-light border border-white/[0.06] text-sm text-ndp-text cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="w-4 h-4 rounded accent-ndp-accent flex-shrink-0" />
            {t('admin.services.set_default')}
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving || fetchingPlexToken || !!plexDiscoveryToken} className="btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? t('common.save') : t('common.add')}
            </button>
          </div>
        </form>
        <AdminPasswordModal
          open={pwdPrompt !== null}
          title={t(pwdPrompt?.kind === 'copy' ? 'admin.services.confirm_copy_title' : 'admin.services.confirm_reveal_title')}
          description={t(pwdPrompt?.kind === 'copy' ? 'admin.services.confirm_copy_desc' : 'admin.services.confirm_reveal_desc')}
          onSubmit={handlePwdSubmit}
          onClose={() => setPwdPrompt(null)}
        />
      </div>
    </div>,
    document.body,
  );
}
