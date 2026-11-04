import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Save, CheckCircle, Send, Eye, EyeOff, Pencil, Power } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useModal } from '@/hooks/useModal';
import { Link } from 'react-router-dom';

// ─── Types from registry API ────────────────────────────

interface SettingField {
  key: string;
  labelKey: string;
  type: 'text' | 'password';
  placeholder?: string;
  required?: boolean;
}

interface ProviderMeta {
  id: string;
  nameKey: string;
  icon: string;
  settingsSchema: SettingField[];
}

interface EventTypeMeta {
  key: string;
  labelKey: string;
}

interface ProviderConfig {
  providerId: string;
  enabled: boolean;
  settings: string; // JSON
}

// ─── Component ──────────────────────────────────────────

export function NotificationsTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Registry metadata
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeMeta[]>([]);

  // Per-provider state
  const [configs, setConfigs] = useState<Record<string, { enabled: boolean; settings: Record<string, string> }>>({});
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  // The email channel owns only the recipient; the transport it sends through is instance-wide
  // (Admin → System → Mail) and shared with password reset.
  const [mailReady, setMailReady] = useState(true);

  // Modal state
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const { dialogRef: providerDialogRef, titleId: providerTitleId } = useModal({
    open: editingProvider !== null,
    onClose: () => setEditingProvider(null),
  });
  const [editSettings, setEditSettings] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Test state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ providerId: string; ok: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/admin/notifications/meta'),
      api.get('/admin/notifications/providers'),
      api.get('/admin/settings'),
    ]).then(async ([metaRes, configsRes, settingsRes]) => {
      const meta = metaRes.data;
      setProviders(meta.providers);
      setEventTypes(meta.eventTypes);

      // Build configs map from DB
      const cfgMap: Record<string, { enabled: boolean; settings: Record<string, string> }> = {};
      for (const p of meta.providers) {
        cfgMap[p.id] = { enabled: false, settings: {} };
      }
      for (const cfg of configsRes.data as ProviderConfig[]) {
        cfgMap[cfg.providerId] = {
          enabled: cfg.enabled,
          settings: cfg.settings ? JSON.parse(cfg.settings) : {},
        };
      }
      setConfigs(cfgMap);

      if (meta.providers.some((p: ProviderMeta) => p.id === 'email')) {
        try {
          const { data: mail } = await api.get('/admin/mail');
          setMailReady(Boolean(mail.configured && mail.enabled));
        } catch {
          setMailReady(false);
        }
      }

      // Parse matrix
      const savedMatrix = settingsRes.data.notificationMatrix
        ? JSON.parse(settingsRes.data.notificationMatrix)
        : {};
      const fullMatrix: Record<string, Record<string, boolean>> = {};
      for (const et of meta.eventTypes) {
        fullMatrix[et.key] = {};
        for (const p of meta.providers) {
          fullMatrix[et.key][p.id] = savedMatrix[et.key]?.[p.id] ?? false;
        }
      }
      setMatrix(fullMatrix);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const isConfigured = (providerId: string) => {
    const cfg = configs[providerId];
    if (!cfg?.enabled) return false;
    // A recipient without a working transport is not a configured channel.
    if (providerId === 'email' && !mailReady) return false;
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return false;
    return provider.settingsSchema
      .filter(f => f.required !== false)
      .every(f => !!cfg.settings[f.key]);
  };

  const toggleProvider = (providerId: string) => {
    setConfigs(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], enabled: !prev[providerId]?.enabled },
    }));
  };

  const openEditModal = (providerId: string) => {
    setEditSettings({ ...configs[providerId]?.settings });
    setShowSecrets({});
    setEditingProvider(providerId);
  };

  const saveProviderConfig = async () => {
    if (!editingProvider) return;
    const newSettings = { ...editSettings };
    setConfigs(prev => ({
      ...prev,
      [editingProvider]: { ...prev[editingProvider], enabled: true, settings: newSettings },
    }));
    setEditingProvider(null);
    // Persist immediately to DB
    try {
      await api.put(`/admin/notifications/providers/${editingProvider}`, {
        enabled: true,
        settings: newSettings,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const testProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    setTestResult(null);
    try {
      await api.post(`/admin/notifications/test/${providerId}`, configs[providerId]?.settings || {});
      setTestResult({ providerId, ok: true });
    } catch {
      setTestResult({ providerId, ok: false });
    } finally {
      setTestingProvider(null);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const toggleMatrix = (eventKey: string, providerId: string) => {
    setMatrix(prev => ({
      ...prev,
      [eventKey]: { ...prev[eventKey], [providerId]: !prev[eventKey]?.[providerId] },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Save each provider config
      const providerSaves = Object.entries(configs).map(([providerId, cfg]) =>
        api.put(`/admin/notifications/providers/${providerId}`, {
          enabled: cfg.enabled,
          settings: cfg.settings,
        })
      );

      // Save matrix
      const matrixSave = api.put('/admin/settings', {
        notificationMatrix: JSON.stringify(matrix),
      });

      await Promise.all([...providerSaves, matrixSave]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const renderProviderModal = () => {
    const provider = providers.find(p => p.id === editingProvider);
    if (!provider) return null;
    return createPortal(
      <div className="modal-overlay z-50" onMouseDown={() => setEditingProvider(null)}>
        <div
          ref={providerDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={providerTitleId}
          className="modal-panel p-5 sm:p-6 w-full max-w-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h3 id={providerTitleId} className="text-base font-semibold text-ndp-text mb-5">{t(provider.nameKey)}</h3>
          <div className="space-y-4">
            {provider.settingsSchema.map((field) => {
              const inputId = `notif-${provider.id}-${field.key}`;
              return (
              <div key={field.key}>
                <label htmlFor={inputId} className="text-xs font-medium text-ndp-text-muted block mb-1.5">{t(field.labelKey)}</label>
                <div className="relative">
                  <input
                    id={inputId}
                    type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                    value={editSettings[field.key] || ''}
                    onChange={(e) => setEditSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="input w-full text-sm pr-10"
                  />
                  {field.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                      aria-label={showSecrets[field.key] ? t('common.hide') : t('common.show')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text"
                    >
                      {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setEditingProvider(null)} className="btn-secondary text-sm px-4 py-2">{t('common.cancel')}</button>
            <button onClick={saveProviderConfig} className="btn-primary text-sm px-4 py-2 flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> {t('common.save')}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout
      title={t('admin.notifications.channels')}
      actions={
        <button onClick={handleSave} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-4 py-2 min-h-[40px] rounded-lg transition-colors', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? t('common.saved') : t('common.save')}
        </button>
      }
    >
      <div className="space-y-8">
        {/* Providers */}
        <section>
          {providers.length === 0 ? (
            <p className="admin-group px-4 py-6 text-sm text-center text-ndp-text-dim">{t('admin.notifications.no_providers')}</p>
          ) : (
            <div className="admin-group divide-y divide-white/[0.06]">
              {providers.map((provider) => {
                const configured = isConfigured(provider.id);
                const enabled = configs[provider.id]?.enabled ?? false;
                const result = testResult?.providerId === provider.id ? testResult : null;

                return (
                  <div key={provider.id} className="admin-row flex-wrap sm:flex-nowrap">
                    <div className={clsx('flex-1 min-w-0 flex items-center gap-3', !enabled && 'opacity-50')}>
                      <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', configured && enabled ? 'bg-ndp-success' : 'bg-ndp-text-dim')} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ndp-text truncate">{t(provider.nameKey)}</p>
                        {provider.id === 'email' && !mailReady && (
                          <Link to="/admin?tab=mail" className="block text-xs text-ndp-accent hover:underline mt-0.5">
                            {t('admin.notifications.email_needs_transport')}
                          </Link>
                        )}
                      </div>
                    </div>

                    {result && (
                      <span className={clsx('admin-chip flex-shrink-0', result.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300')}>
                        {result.ok ? t('admin.notifications.test_success') : t('admin.notifications.test_failed')}
                      </span>
                    )}

                    <div className="flex items-center gap-0.5 flex-shrink-0 -mr-2">
                      <button
                        onClick={() => testProvider(provider.id)}
                        disabled={!configured || !enabled || testingProvider === provider.id}
                        className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ndp-text-dim"
                        title={t('common.test')}
                        aria-label={t('common.test')}
                      >
                        {testingProvider === provider.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEditModal(provider.id)}
                        className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors"
                        title={t('common.configure')}
                        aria-label={t('common.configure')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleProvider(provider.id)}
                        className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors"
                        title={enabled ? t('common.disable') : t('common.enable')}
                        aria-label={enabled ? t('common.disable') : t('common.enable')}
                      >
                        <Power className={clsx('w-4 h-4', enabled && 'text-ndp-success')} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Event Matrix */}
        <section>
          <h2 className="admin-group-label">{t('admin.notifications.matrix_title')}</h2>
          <div className="admin-group divide-y divide-white/[0.06]">
            {eventTypes.map((et) => (
              <div key={et.key} className="admin-row flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm text-ndp-text flex-1 min-w-0">{t(et.labelKey)}</span>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  {providers.map((provider) => {
                    const enabled = configs[provider.id]?.enabled ?? false;
                    const active = matrix[et.key]?.[provider.id] ?? false;
                    return (
                      <button
                        key={provider.id}
                        onClick={() => enabled && toggleMatrix(et.key, provider.id)}
                        disabled={!enabled}
                        aria-pressed={active}
                        className={clsx(
                          'min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors ring-1 ring-inset',
                          !enabled ? 'opacity-30 cursor-not-allowed bg-white/[0.03] ring-white/[0.04] text-ndp-text-dim' :
                          active ? 'bg-ndp-accent/10 ring-ndp-accent/30 text-ndp-accent' : 'bg-white/[0.04] ring-white/[0.06] text-ndp-text-dim hover:bg-white/[0.08] hover:text-ndp-text'
                        )}
                      >
                        {t(provider.nameKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="admin-hint">{t('admin.notifications.matrix_desc')}</p>
        </section>
      </div>

      {/* Provider config modal */}
      {editingProvider && renderProviderModal()}
    </AdminTabLayout>
  );
}
