import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { clsx } from 'clsx';
import {
  Loader2, CheckCircle, Key, Copy, RefreshCw, Trash2, Eye, EyeOff, AlertTriangle,
} from 'lucide-react';
import api from '@/lib/api';
import { showToast } from '@/utils/toast';
import { useFeatures } from '@/context/FeaturesContext';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { GithubSection } from './GithubSection';
import { FloatingSaveBar } from '@/components/FloatingSaveBar';
import Switch from '@/components/ui/Switch';

// Only locales that actually ship a translation bundle (i18n/index.ts registers en + fr). Offering
// de/es/it/pt/nl silently fell back to English for the whole UI — re-add a code here only once its
// locales/<code>/translation.json exists and is registered.
const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

/**
 * "Who is this LeMedia" — identity, public URL, maintenance banner, language, version, API key.
 * Lives in the System group. Split out of the old General tab so the feature flags and the site
 * identity aren't mixed together; each concern owns its own save flow.
 */
export function InstanceTab() {
  const { t } = useTranslation();
  const { refreshFeatures } = useFeatures();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [siteName, setSiteName] = useState('LeMedia');
  const [siteUrl, setSiteUrl] = useState('');
  const [instanceLanguage, setInstanceLanguage] = useState('en');
  const [bannerText, setBannerText] = useState('');
  const versionInfo = useVersionInfo();
  const [apiKeyFull, setApiKeyFull] = useState<string | null>(null);
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [apiKeyHasKey, setApiKeyHasKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [verboseLog, setVerboseLog] = useState(false);
  const [verboseLogToggling, setVerboseLogToggling] = useState(false);

  const initialValues = useRef<Record<string, unknown>>({});

  // Settings + banner are the load-critical calls — if either fails we refuse to render the form
  // so the admin doesn't silently overwrite real config with `LeMedia` / empty defaults on save.
  // Version + api-key probes are best-effort (failing them just hides the card / update badge).
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [settingsRes, bannerRes] = await Promise.all([
        api.get('/admin/settings'),
        api.get('/app/banner'),
      ]);
      const vals = {
        siteName: settingsRes.data.siteName ?? 'LeMedia',
        siteUrl: settingsRes.data.siteUrl ?? '',
        instanceLanguage: settingsRes.data.instanceLanguages?.[0] ?? 'en',
        bannerText: bannerRes.data.banner || '',
      };
      setSiteName(vals.siteName);
      setSiteUrl(vals.siteUrl);
      setInstanceLanguage(vals.instanceLanguage);
      setBannerText(vals.bannerText);
      initialValues.current = vals;

      // Non-critical probes — let these fail silently, they just degrade the UI.
      api.get('/admin/api-key')
        .then(({ data }) => { setApiKeyHasKey(data.hasKey); setApiKeyMasked(data.maskedKey); })
        .catch(() => {});
      api.get('/admin/verbose-request-log')
        .then(({ data }) => setVerboseLog(!!data.enabled))
        .catch(() => {});
    } catch (err) {
      console.error('InstanceTab load failed', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const currentValues = useMemo(
    () => ({ siteName, siteUrl, instanceLanguage, bannerText }),
    [siteName, siteUrl, instanceLanguage, bannerText]
  );

  const hasChanges = !loading && Object.keys(initialValues.current).length > 0 &&
    Object.entries(currentValues).some(([k, v]) => initialValues.current[k] !== v);

  const handleReset = () => {
    const iv = initialValues.current;
    setSiteName(iv.siteName as string);
    setSiteUrl(iv.siteUrl as string);
    setInstanceLanguage(iv.instanceLanguage as string);
    setBannerText(iv.bannerText as string);
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setSaveError(null);
    try {
      await Promise.all([
        api.put('/admin/settings', {
          siteName: siteName.trim() || 'LeMedia',
          siteUrl: siteUrl.trim() || '',
          instanceLanguages: [instanceLanguage],
        }),
        api.put('/admin/banner', { banner: bannerText.trim() || null }),
      ]);
      await refreshFeatures();
      initialValues.current = { ...currentValues };
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('InstanceTab save failed', err);
      setSaveError(t('admin.save_bar.save_failed'));
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  if (loadError) {
    return (
      <AdminTabLayout>
        <div className="rounded-xl p-4 flex items-start gap-3 border border-ndp-danger/20 bg-ndp-danger/5">
          <AlertTriangle className="w-5 h-5 text-ndp-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-ndp-text">{t('admin.load.failed')}</p>
            <button onClick={loadAll} className="btn-secondary text-sm mt-3 inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              {t('admin.load.retry')}
            </button>
          </div>
        </div>
      </AdminTabLayout>
    );
  }

  return (
    <AdminTabLayout>
      <div className="space-y-8">
      {versionInfo && (
        <div className="admin-group">
          <div className="admin-row">
            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-ndp-text">{t('admin.instance.lemedia')}</span>
              <span className="admin-chip font-mono">{versionInfo.current}</span>
            </div>
          </div>
        </div>
      )}

      <div className="admin-group divide-y divide-white/[0.06]">
        <div className="px-4 py-3.5">
          <label className="block mb-2">
            <span className="block text-sm font-medium text-ndp-text">{t('admin.instance.site_name')}</span>
            <span className="block text-xs text-ndp-text-dim mt-0.5 leading-relaxed">{t('admin.instance.site_name_desc')}</span>
          </label>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="LeMedia" aria-label={t('admin.instance.site_name')} className="input w-full py-2.5 text-sm" />
        </div>
        <div className="px-4 py-3.5">
          <label className="block mb-2">
            <span className="block text-sm font-medium text-ndp-text">{t('admin.instance.site_url')}</span>
            <span className="block text-xs text-ndp-text-dim mt-0.5 leading-relaxed">{t('admin.instance.site_url_desc')}</span>
          </label>
          <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://media.example.com" aria-label={t('admin.instance.site_url')} className="input w-full py-2.5 text-sm" />
        </div>
        <div className="px-4 py-3.5">
          <label className="block mb-2">
            <span className="block text-sm font-medium text-ndp-text">{t('admin.instance.instance_languages')}</span>
            <span className="block text-xs text-ndp-text-dim mt-0.5 leading-relaxed">{t('admin.instance.instance_languages_desc')}</span>
          </label>
          <select value={instanceLanguage} onChange={(e) => setInstanceLanguage(e.target.value)} aria-label={t('admin.instance.instance_languages')} className="input py-2.5 text-sm w-full">
            {AVAILABLE_LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="px-4 py-3.5">
          <label className="block mb-2">
            <span className="block text-sm font-medium text-ndp-text">{t('admin.instance.maintenance_banner')}</span>
            <span className="block text-xs text-ndp-text-dim mt-0.5 leading-relaxed">{t('admin.instance.maintenance_desc')}</span>
          </label>
          <input value={bannerText} onChange={(e) => setBannerText(e.target.value)} placeholder={t('admin.instance.maintenance_placeholder')} aria-label={t('admin.instance.maintenance_banner')} className="input w-full py-2.5 text-sm" />
        </div>
      </div>

      <section>
        <h2 className="admin-group-label">{t('admin.debug.title')}</h2>
        <div className={clsx('admin-group', verboseLog && 'ring-amber-400/30 bg-amber-400/[0.04]')}>
          <div className="admin-row items-start flex-row-reverse">
            <Switch
              checked={verboseLog}
              tone="warning"
              disabled={verboseLogToggling}
              label={t('admin.debug.verbose_title')}
              className="-mr-1.5 -my-1"
              onChange={async () => {
                const next = !verboseLog;
                setVerboseLogToggling(true);
                try {
                  await api.put('/admin/verbose-request-log', { enabled: next });
                  setVerboseLog(next);
                } catch {
                  showToast(t('admin.debug.toggle_failed'), 'error');
                } finally {
                  setVerboseLogToggling(false);
                }
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ndp-text">{t('admin.debug.verbose_title')}</p>
              <p className="text-xs text-ndp-text-dim mt-0.5 leading-relaxed">
                <Trans i18nKey="admin.debug.verbose_desc">
                  Persists every <code className="text-ndp-text bg-black/30 px-1 rounded">/api/*</code> request to <strong>Logs</strong> with status, redirect target, IP and user-agent. Useful for tracing OAuth round-trips. Tokens and auth headers are scrubbed.
                </Trans>
              </p>
              {verboseLog && (
                <p className="text-xs text-amber-300 mt-2 leading-relaxed">
                  {t('admin.debug.verbose_warning')}
                </p>
              )}
            </div>
          </div>
        </div>
        <p className="admin-hint">{t('admin.debug.help')}</p>
      </section>

      <section>
        <h2 className="admin-group-label flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5" />
          {t('admin.instance.api_key')}
        </h2>
        <div className="admin-group p-4">
          {apiKeyHasKey ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="sm:flex-1 min-w-0 text-xs font-mono bg-black/30 ring-1 ring-inset ring-white/[0.06] px-3 py-2.5 rounded-lg text-ndp-text break-all sm:truncate select-all">
                {apiKeyVisible && apiKeyFull ? apiKeyFull : apiKeyMasked}
              </code>
              <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={async () => {
                  // First reveal needs to hit the server. Subsequent toggles work from the
                  // in-memory copy so admins can flip visibility without re-hitting the API.
                  if (!apiKeyFull) {
                    setApiKeyLoading(true);
                    try {
                      const { data } = await api.get('/admin/api-key/reveal');
                      setApiKeyFull(data.apiKey);
                      setApiKeyVisible(true);
                    } catch (err) {
                      console.error('Reveal API key failed', err);
                      showToast(t('admin.instance.api_key_reveal_failed'), 'error');
                    } finally { setApiKeyLoading(false); }
                  } else {
                    setApiKeyVisible(!apiKeyVisible);
                  }
                }}
                disabled={apiKeyLoading}
                className="btn-secondary text-xs min-h-[40px] min-w-[40px] px-2.5 py-2 flex items-center justify-center flex-shrink-0"
                aria-label={apiKeyVisible ? t('admin.instance.api_key_hide') : t('admin.instance.api_key_show')}
              >
                {apiKeyLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : apiKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={async () => {
                  let key = apiKeyFull;
                  if (!key) {
                    try {
                      const { data } = await api.get('/admin/api-key/reveal');
                      key = data.apiKey;
                      setApiKeyFull(data.apiKey);
                    } catch (err) {
                      console.error('Reveal for copy failed', err);
                      showToast(t('admin.instance.api_key_reveal_failed'), 'error');
                      return;
                    }
                  }
                  try {
                    await navigator.clipboard.writeText(key!);
                    setApiKeyCopied(true);
                    setTimeout(() => setApiKeyCopied(false), 2000);
                  } catch (err) {
                    console.error('Clipboard write failed', err);
                    showToast(t('admin.instance.api_key_copy_failed'), 'error');
                  }
                }}
                className="btn-secondary text-xs min-h-[40px] px-3 py-2 flex flex-1 sm:flex-none items-center justify-center gap-1.5"
              >
                {apiKeyCopied ? <CheckCircle className="w-3.5 h-3.5 text-ndp-success" /> : <Copy className="w-3.5 h-3.5" />}
                {apiKeyCopied ? t('common.copied') : t('common.copy')}
              </button>
              <button
                onClick={async () => {
                  setApiKeyLoading(true);
                  try {
                    const { data } = await api.post('/admin/api-key/generate');
                    setApiKeyFull(data.apiKey);
                    setApiKeyMasked(`${data.apiKey.slice(0, 8)}${'•'.repeat(24)}${data.apiKey.slice(-8)}`);
                    setApiKeyHasKey(true);
                    setApiKeyVisible(true);
                  } catch (err) {
                    console.error('Regenerate API key failed', err);
                    showToast(t('admin.instance.api_key_regenerate_failed'), 'error');
                  } finally { setApiKeyLoading(false); }
                }}
                disabled={apiKeyLoading}
                className="btn-secondary text-xs min-h-[40px] px-3 py-2 flex flex-1 sm:flex-none items-center justify-center gap-1.5"
              >
                <RefreshCw className={clsx('w-3.5 h-3.5', apiKeyLoading && 'animate-spin')} />
                {t('admin.instance.regenerate')}
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.delete('/admin/api-key');
                    setApiKeyFull(null);
                    setApiKeyMasked(null);
                    setApiKeyHasKey(false);
                    setApiKeyVisible(false);
                  } catch (err) {
                    console.error('Revoke API key failed', err);
                    showToast(t('admin.instance.api_key_revoke_failed'), 'error');
                  }
                }}
                className="btn-danger text-xs min-h-[40px] min-w-[40px] px-2.5 py-2 flex items-center justify-center flex-shrink-0"
                aria-label={t('admin.instance.api_key_revoke')}
                title={t('admin.instance.api_key_revoke')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-ndp-text-dim">{t('admin.instance.no_api_key')}</span>
              <button
                onClick={async () => {
                  setApiKeyLoading(true);
                  try {
                    const { data } = await api.post('/admin/api-key/generate');
                    setApiKeyFull(data.apiKey);
                    setApiKeyMasked(`${data.apiKey.slice(0, 8)}${'•'.repeat(24)}${data.apiKey.slice(-8)}`);
                    setApiKeyHasKey(true);
                    setApiKeyVisible(true);
                  } catch (err) {
                    console.error('Generate API key failed', err);
                    showToast(t('admin.instance.api_key_generate_failed'), 'error');
                  } finally { setApiKeyLoading(false); }
                }}
                disabled={apiKeyLoading}
                className="btn-primary text-sm min-h-[40px] px-4 py-2 flex items-center justify-center gap-2"
              >
                {apiKeyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                {t('admin.instance.generate_api_key')}
              </button>
            </div>
          )}
        </div>
        <p className="admin-hint">{t('admin.instance.api_key_desc')}</p>
      </section>

      <GithubSection />
      </div>

      <FloatingSaveBar show={hasChanges} saving={saving} saved={saved} error={saveError} onSave={handleSave} onReset={handleReset} />
    </AdminTabLayout>
  );
}
