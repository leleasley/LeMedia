import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { checkPasswordStrength } from '@/utils/passwordStrength';

export default function InvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [email, setEmail] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteError(t('invite.error.INVALID_TOKEN'));
      setLoadingInvite(false);
      return;
    }
    api.get('/auth/invite/validate', { params: { token } })
      .then(({ data }) => {
        setEmail(data.email);
        setDisplayName(data.email.split('@')[0]);
      })
      .catch((err) => {
        const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        setInviteError(t(`invite.error.${code ?? 'INVALID_TOKEN'}`, { defaultValue: t('invite.error.INVALID_TOKEN') }));
      })
      .finally(() => setLoadingInvite(false));
  }, [token, t]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError(t('register.password_mismatch'));
    const { valid, reason } = checkPasswordStrength(password);
    if (!valid) return setError(t(`errors.${reason ?? 'PASSWORD_WEAK'}`, { defaultValue: t('errors.PASSWORD_WEAK') }));

    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/invite/accept', { token, password, displayName: displayName.trim() || undefined });
      setDone(true);
      setTimeout(() => navigate('/login?invited=1'), 2000);
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(t(`invite.error.${code ?? 'GENERIC'}`, { defaultValue: t(`errors.${code ?? 'GENERIC'}`, { defaultValue: String(code ?? t('invite.error.GENERIC')) }) }));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-6 h-6 border-2 border-ndp-accent/30 border-t-ndp-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (inviteError || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <p className="text-ndp-danger mb-4">{inviteError ?? t('invite.error.INVALID_TOKEN')}</p>
          <Link to="/login" className="text-ndp-accent hover:underline flex items-center justify-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> {t('reset.back_to_login')}
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-white/10 bg-ndp-surface p-6 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-ndp-success" />
            <h2 className="text-lg font-semibold text-ndp-text">{t('invite.done_title')}</h2>
            <p className="text-sm text-ndp-text-dim mt-2">{t('invite.done_body')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-ndp-bg">
      <div className="w-full max-w-md">
        <div className="card p-8 shadow-xl">
          <div className="flex flex-col items-center mb-6">
            <img src="/logo-v2.png" alt="LeMedia" className="w-16 h-16 rounded-xl object-contain ring-1 ring-white/10" />
            <h1 className="text-xl font-bold text-ndp-text mt-3">{t('invite.title')}</h1>
            <p className="text-sm text-ndp-text-dim mt-1 text-center">{t('invite.subtitle')}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ndp-text-dim mb-1.5">{t('login.email_placeholder')}</label>
              <input value={email} disabled className="input w-full opacity-60 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ndp-text-dim mb-1.5">{t('register.displayname')}</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('register.displayname')} className="input w-full" />
            </div>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.password_placeholder')}
                required
                autoFocus
                className="input w-full pr-10"
              />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? t('common.hide') : t('common.show')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ndp-text-dim hover:text-ndp-text">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordStrengthMeter password={password} />
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('register.password_confirm')} required className="input w-full" />
            {error && <p className="text-sm text-ndp-danger">{error}</p>}
            <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
              {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {t('invite.submit')}
            </button>
          </form>

          <Link to="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-ndp-text-dim hover:text-ndp-text">
            <ArrowLeft className="w-4 h-4" /> {t('reset.back_to_login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
