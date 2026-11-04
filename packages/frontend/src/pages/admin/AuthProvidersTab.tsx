import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { KeyRound, Loader2, Check, Copy, Pencil, Power, X, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { extractApiError } from '@/utils/toast';
import { useModal } from '@/hooks/useModal';
import Switch from '@/components/ui/Switch';

interface AuthProviderField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'url' | 'boolean';
  required?: boolean;
  placeholder?: string;
  help?: string;
  default?: string | boolean;
}

interface AuthProviderRow {
  id: string;
  label: string;
  type: 'oauth' | 'credentials';
  configSchema: AuthProviderField[];
  requiresService: boolean;
  serviceAvailable: boolean;
  /** OAuth callback URL LeMedia will send to the provider — admin copies this into the provider's portal.
   *  Computed server-side per-request; undefined for non-OAuth providers. */
  callbackUrl?: string;
  enabled: boolean;
  /** Per-provider config values. Booleans (e.g. allowSignup) come as true/false; strings for the rest. */
  config: Record<string, string | boolean>;
}

const MASK = '__MASKED__';

export function AuthProvidersTab() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<AuthProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AuthProviderRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/auth-providers');
      setProviders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const toggle = async (p: AuthProviderRow) => {
    setTogglingId(p.id);
    try {
      await api.patch(`/admin/auth-providers/${p.id}`, { enabled: !p.enabled });
      await fetchProviders();
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout title={t('admin.authProviders.title')} count={providers.length}>
      <p className="text-sm text-ndp-text-muted leading-relaxed -mt-2 mb-6 max-w-2xl">{t('admin.authProviders.subtitle')}</p>

      {providers.length === 0 ? (
        <div className="admin-group px-6 py-10 text-center">
          <div className="admin-icon-tile mx-auto mb-3 !w-10 !h-10 text-ndp-text-dim">
            <KeyRound className="w-5 h-5" />
          </div>
          <p className="text-sm text-ndp-text-muted">{t('admin.authProviders.empty')}</p>
        </div>
      ) : (
        <div className="admin-group divide-y divide-white/[0.06]">
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              busy={togglingId === p.id}
              onToggle={() => toggle(p)}
              onEdit={() => setEditing(p)}
            />
          ))}
        </div>
      )}

      {editing && createPortal(
        <ProviderConfigModal
          provider={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchProviders(); }}
        />,
        document.body
      )}
    </AdminTabLayout>
  );
}

function ProviderRow({
  provider, busy, onToggle, onEdit,
}: {
  provider: AuthProviderRow;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  // Grey out the row when a required Service isn't configured — the toggle would "work"
  // server-side but the login wouldn't, so we signal unavailability without hiding the entry.
  const unavailable = provider.requiresService && !provider.serviceAvailable;
  const hasSettings = provider.configSchema.length > 0;
  const showSignup = provider.configSchema.some(f => f.key === 'allowSignup') && !unavailable;
  const signupChip = showSignup && (
    <span
      className={clsx(
        'admin-chip whitespace-nowrap',
        provider.config.allowSignup === true && 'bg-emerald-500/15 text-emerald-300'
      )}
    >
      {provider.config.allowSignup === true
        ? t('admin.authProviders.signup_on')
        : t('admin.authProviders.signup_off')}
    </span>
  );

  return (
    <div className={clsx('admin-row', unavailable && 'opacity-50')}>
      {/* Logo tile with the enabled/disabled status dot pinned to its corner. */}
      <span className="relative flex-shrink-0">
        <span className="admin-icon-tile !w-10 !h-10 overflow-hidden font-semibold">
          <img
            src={`/${provider.id}.svg`}
            alt=""
            className="w-5 h-5 object-contain"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'block';
            }}
          />
          <span className="hidden text-sm">{provider.label.charAt(0).toUpperCase()}</span>
        </span>
        <span
          className={clsx(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-ndp-surface',
            provider.enabled && !unavailable ? 'bg-ndp-success' : 'bg-ndp-text-dim'
          )}
        />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-ndp-text truncate">{provider.label}</span>
          <span className="text-[11px] text-ndp-text-dim whitespace-nowrap flex-shrink-0">
            {provider.type === 'oauth' ? 'OAuth 2.0' : 'Credentials'}
          </span>
        </div>
        {unavailable ? (
          <div className="flex items-start gap-1.5 mt-0.5 text-xs text-ndp-warning">
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span className="min-w-0">{t('admin.authProviders.service_required', { service: provider.label })}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
            <span className="text-xs text-ndp-text-dim">
              {hasSettings
                ? t('admin.authProviders.n_fields', { count: provider.configSchema.length })
                : t('admin.authProviders.no_config')}
            </span>
            {/* Phones: signup status sits under the name to keep the row narrow. */}
            {signupChip && <span className="sm:hidden">{signupChip}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 -mr-2">
        {signupChip && <span className="hidden sm:inline-flex mr-2">{signupChip}</span>}
        {hasSettings && (
          <button
            onClick={onEdit}
            disabled={unavailable}
            className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('common.edit')}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onToggle}
          disabled={busy || unavailable}
          className="w-10 h-10 flex items-center justify-center text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={provider.enabled ? t('common.disable') : t('common.enable')}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Power className={clsx('w-4 h-4', provider.enabled && !unavailable && 'text-ndp-success')} />
          )}
        </button>
      </div>
    </div>
  );
}

function ProviderConfigModal({
  provider, onClose, onSaved,
}: {
  provider: AuthProviderRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { dialogRef, titleId } = useModal({ open: true, onClose });
  const [config, setConfig] = useState<Record<string, string | boolean>>(provider.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Strip fields that still hold the server-side MASK so we don't clobber stored secrets.
      // Booleans pass through unchanged (MASK only ever applies to password strings).
      const cleaned: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(config)) {
        if (v === MASK) continue;
        cleaned[k] = v;
      }
      await api.patch(`/admin/auth-providers/${provider.id}`, { config: cleaned });
      onSaved();
    } catch (err: unknown) {
      setError(extractApiError(err, (err as Error).message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel w-full max-w-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ndp-text truncate">{provider.label}</h2>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              {provider.type === 'oauth' ? 'OAuth 2.0' : 'Credentials'} · {t('admin.authProviders.configure')}
            </p>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className="w-10 h-10 -mt-2 -mr-2 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 flex flex-col gap-4">
          {provider.callbackUrl && (
            <CallbackUrlBlock url={provider.callbackUrl} />
          )}
          {provider.configSchema.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(v) => setConfig((prev) => ({ ...prev, [field.key]: v }))}
            />
          ))}
          {error && (
            <div className="flex items-start gap-2 text-xs text-ndp-danger bg-ndp-danger/10 ring-1 ring-inset ring-ndp-danger/20 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 sm:px-6 pt-4 pb-5 border-t border-white/[0.06]">
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="btn-secondary text-sm disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('admin.authProviders.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigField({
  field, value, onChange,
}: {
  field: AuthProviderField;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const { t } = useTranslation();
  // Hoisted to the top of the component so React Hooks order stays stable across the
  // boolean/string render branches below.
  const [revealMasked, setRevealMasked] = useState(false);
  // Localize known field keys when a translation exists; otherwise fall through to the English
  // string declared by the provider. Keeps the backend free of i18n plumbing while letting us
  // localize the commonly-shared fields (allowSignup, guildId, …).
  const labelKey = `admin.authProviders.fields.${field.key}.label`;
  const helpKey = `admin.authProviders.fields.${field.key}.help`;
  const localizedLabel = t(labelKey);
  const localizedHelp = t(helpKey);
  const label = localizedLabel === labelKey ? field.label : localizedLabel;
  const help = localizedHelp === helpKey ? field.help : localizedHelp;

  if (field.type === 'boolean') {
    // Resolve the effective value: stored boolean wins, else fall back to the declared default,
    // else false. Lets the admin see the right state even when they never changed anything.
    const effective =
      typeof value === 'boolean'
        ? value
        : typeof field.default === 'boolean'
        ? field.default
        : false;
    return (
      <div className="flex items-start gap-3 rounded-lg bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-3 py-3">
        <div className="flex-1 min-w-0">
          <span className="text-sm text-ndp-text">{label}</span>
          {help && <p className="text-xs text-ndp-text-dim mt-0.5 leading-relaxed">{help}</p>}
        </div>
        <Switch checked={effective} onChange={(next) => onChange(next)} label={label} className="-my-2" />
      </div>
    );
  }

  const strValue = typeof value === 'string' ? value : '';
  const isMasked = strValue === MASK;
  const displayValue = isMasked && !revealMasked ? '••••••••' : strValue;
  const hasValue = !!strValue && !isMasked;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ndp-text-muted">
        {label}{field.required && ' *'}
      </span>
      <div className="flex gap-2">
        <input
          type={field.type === 'password' && !revealMasked ? 'password' : 'text'}
          value={displayValue}
          placeholder={field.placeholder}
          onFocus={() => {
            if (isMasked) {
              onChange('');
              setRevealMasked(true);
            }
          }}
          onChange={(e) => onChange(e.target.value)}
          className="input flex-1 min-w-0"
        />
        {field.type === 'url' && hasValue && (
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(strValue); }}
            className="btn-secondary !px-3 flex items-center justify-center flex-shrink-0"
            title="Copy"
            aria-label="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
      {help && <p className="text-xs text-ndp-text-dim leading-relaxed">{help}</p>}
    </label>
  );
}

/** Read-only display of the OAuth callback URL the admin must register in the provider's portal. */
function CallbackUrlBlock({ url }: Readonly<{ url: string }>) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg ring-1 ring-inset ring-white/[0.08] bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ndp-text">{t('admin.authProviders.callback_url')}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 px-2.5 min-h-[36px] -my-1 -mr-1 rounded-lg text-xs font-medium text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-ndp-success" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
      <code className="text-xs leading-relaxed bg-black/30 rounded-md px-2.5 py-2 text-ndp-text font-mono break-all select-all">
        {url}
      </code>
      <p className="text-xs text-ndp-text-dim leading-relaxed">{t('admin.authProviders.callback_url_help')}</p>
    </div>
  );
}
