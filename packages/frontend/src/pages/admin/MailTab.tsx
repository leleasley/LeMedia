import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Mail, Send } from 'lucide-react';
import api from '@/lib/api';
import { showToast, toastApiError } from '@/utils/toast';

interface MailView {
  enabled: boolean;
  transport: 'smtp' | 'resend';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromEmail: string;
  fromEnv: boolean;
  hasPassword: boolean;
  hasApiKey: boolean;
  configured: boolean;
}

const EMPTY: MailView = {
  enabled: false, transport: 'smtp', host: '', port: 587, secure: false,
  user: '', fromEmail: '', fromEnv: false, hasPassword: false, hasApiKey: false, configured: false,
};

export function MailTab() {
  const { t } = useTranslation();
  const [mail, setMail] = useState<MailView>(EMPTY);
  const [resetEnabled, setResetEnabled] = useState(false);
  // The reset link's host comes from siteUrl and nothing else, so an unset siteUrl blocks the feature.
  const [hasSiteUrl, setHasSiteUrl] = useState(false);
  // Secrets are never returned by the API, so they live outside `mail`: blank means "keep stored".
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [{ data: mailData }, { data: settings }] = await Promise.all([
        api.get('/admin/mail'),
        api.get('/admin/settings'),
      ]);
      setMail(mailData);
      setResetEnabled(Boolean(settings.passwordResetEnabled));
      setHasSiteUrl(Boolean(settings.siteUrl?.trim()));
    } catch (err) {
      toastApiError(err, t('admin.mail.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put('/admin/mail', {
        enabled: mail.enabled,
        transport: mail.transport,
        host: mail.host,
        port: mail.port,
        secure: mail.secure,
        user: mail.user,
        fromEmail: mail.fromEmail,
        ...(password ? { password } : {}),
        ...(apiKey ? { apiKey } : {}),
      });
      setMail(data);
      setPassword('');
      setApiKey('');
      showToast(t('common.saved'), 'success');
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      if (code === 'MAIL_CONFIGURED_BY_ENV') showToast(t('admin.mail.env_locked'), 'error');
      else toastApiError(err, t('admin.mail.save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      await api.post('/admin/mail/test', {
        to: testTo,
        transport: mail.transport,
        host: mail.host,
        port: mail.port,
        secure: mail.secure,
        user: mail.user,
        fromEmail: mail.fromEmail,
        ...(password ? { password } : {}),
        ...(apiKey ? { apiKey } : {}),
      });
      showToast(t('admin.mail.test_ok'), 'success');
    } catch (err) {
      const body = (err as { response?: { data?: { message?: string; error?: string } } }).response?.data;
      if (body?.error) toastApiError(err, t('admin.mail.test_failed'));
      else showToast(body?.message ?? (err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleReset = async (value: boolean) => {
    setResetEnabled(value);
    try {
      await api.put('/admin/settings', { passwordResetEnabled: value });
      showToast(t('common.saved'), 'success');
    } catch (err) {
      setResetEnabled(!value);
      toastApiError(err, t('admin.mail.toggle_failed'));
    }
  };

  if (loading) return <p className="text-ndp-text-dim">…</p>;

  const locked = mail.fromEnv;

  return (
    <div className="space-y-8 max-w-2xl pb-20">
      <header>
        <h2 className="font-display-title text-3xl text-ndp-text flex items-center gap-2.5">
          <Mail className="w-6 h-6 text-ndp-text-muted" /> {t('admin.mail.title')}
        </h2>
        <p className="text-sm text-ndp-text-muted mt-2 leading-relaxed">{t('admin.mail.desc')}</p>
        <p className="text-xs text-ndp-text-dim mt-1 leading-relaxed">{t('admin.mail.shared_note')}</p>
      </header>

      {locked && (
        <p className="flex items-start gap-2.5 rounded-xl ring-1 ring-inset ring-ndp-accent/25 bg-ndp-accent/[0.07] px-4 py-3 text-sm text-ndp-text leading-relaxed">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-ndp-accent" />
          {t('admin.mail.env_locked')}
        </p>
      )}

      <fieldset disabled={locked} className="space-y-4 disabled:opacity-60 min-w-0">
        <div className="admin-group divide-y divide-white/[0.06]">
          <label className="admin-row cursor-pointer">
            <span className="flex-1 min-w-0 text-sm text-ndp-text">{t('admin.mail.enabled')}</span>
            <input
              type="checkbox"
              checked={mail.enabled}
              onChange={(e) => setMail({ ...mail, enabled: e.target.checked })}
              className="w-5 h-5 accent-ndp-accent flex-shrink-0"
            />
          </label>
          <div className="px-4 py-3">
            <label className="block text-xs font-medium text-ndp-text-muted mb-1.5">{t('admin.mail.transport')}</label>
            <select
              value={mail.transport}
              onChange={(e) => setMail({ ...mail, transport: e.target.value as MailView['transport'] })}
              className="input w-full"
            >
              <option value="smtp">{t('admin.mail.smtp')}</option>
              <option value="resend">{t('admin.mail.resend')}</option>
            </select>
          </div>
        </div>

        <div className="admin-group p-4 space-y-4">
          {mail.transport === 'smtp' ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] sm:grid-cols-[minmax(0,1fr)_8rem] gap-3">
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-ndp-text-muted mb-1.5">{t('admin.mail.host')}</label>
                  <input value={mail.host} onChange={(e) => setMail({ ...mail, host: e.target.value })} className="input w-full" placeholder="smtp.example.com" />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-ndp-text-muted mb-1.5">{t('admin.mail.port')}</label>
                  <input type="number" value={mail.port} onChange={(e) => setMail({ ...mail, port: Number(e.target.value) || 587 })} className="input w-full tabular-nums" />
                </div>
              </div>
              <label className="flex items-center gap-3 min-h-[40px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={mail.secure}
                  onChange={(e) => setMail({ ...mail, secure: e.target.checked })}
                  className="w-5 h-5 accent-ndp-accent flex-shrink-0"
                />
                <span className="text-sm text-ndp-text">{t('admin.mail.secure')}</span>
              </label>
              <div>
                <label className="block text-xs font-medium text-ndp-text-muted mb-1.5">{t('admin.mail.user')}</label>
                <input value={mail.user} onChange={(e) => setMail({ ...mail, user: e.target.value })} className="input w-full" autoComplete="off" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ndp-text-muted mb-1.5">{t('admin.mail.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  autoComplete="new-password"
                  placeholder={mail.hasPassword ? t('admin.mail.secret_kept') : ''}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-ndp-text-muted mb-1.5">{t('admin.mail.apiKey')}</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="input w-full"
                autoComplete="new-password"
                placeholder={mail.hasApiKey ? t('admin.mail.secret_kept') : 're_...'}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ndp-text-muted mb-1.5">{t('admin.mail.from')}</label>
            <input value={mail.fromEmail} onChange={(e) => setMail({ ...mail, fromEmail: e.target.value })} className="input w-full" placeholder="LeMedia &lt;no-reply@example.com&gt;" />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={busy} className="btn-primary w-full sm:w-auto disabled:opacity-50">{t('common.save')}</button>
        </div>
      </fieldset>

      <section>
        <label className="admin-group-label block">{t('admin.mail.test')}</label>
        <div className="admin-group p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={t('admin.mail.test_to')}
              className="input w-full sm:flex-1 min-w-0"
            />
            <button type="button" onClick={sendTest} disabled={busy || !testTo} className="btn-secondary flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50">
              <Send className="w-4 h-4" /> {t('admin.mail.test')}
            </button>
          </div>
        </div>
      </section>

      <div className="admin-group">
        <label className="admin-row items-start cursor-pointer">
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-ndp-text">{t('admin.mail.reset_toggle')}</span>
            <span className="block text-xs text-ndp-text-dim mt-0.5 leading-relaxed">
              {!mail.configured || !mail.enabled
                ? t('admin.mail.reset_needs_mail')
                : !hasSiteUrl ? t('admin.mail.reset_needs_siteurl') : t('admin.mail.reset_hint')}
            </span>
          </span>
          <input
            type="checkbox"
            checked={resetEnabled}
            disabled={!mail.configured || !mail.enabled || !hasSiteUrl}
            onChange={(e) => toggleReset(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-ndp-accent flex-shrink-0 disabled:opacity-40"
          />
        </label>
      </div>
    </div>
  );
}
