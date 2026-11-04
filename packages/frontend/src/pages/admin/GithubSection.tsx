import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import { GithubMark as Github } from '@/icons/GithubMark';
import api from '@/lib/api';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast, toastApiError } from '@/utils/toast';

interface GithubStatus {
  connected: boolean; login: string | null; avatar: string | null; source: 'oauth' | 'token' | null;
  scopes: string | null; connectedAt: string | null; oauthAvailable: boolean;
  repos: { zurg: string; rex: string };
}

/** Admin → Instance → GitHub: LeMedia's own GitHub connection, used to read the Zurg and rex
 *  release feeds (private repos) so their pages can say when an update is out. */
export function GithubSection() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');
  const [repos, setRepos] = useState({ zurg: '', rex: '' });
  const [busy, setBusy] = useState<null | 'token' | 'repos' | 'disconnect'>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<GithubStatus>('/admin/github');
      setStatus(data);
      setRepos(data.repos);
    } catch (err) { toastApiError(err, t('admin.github.load_failed', 'Could not load the GitHub connection')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  // Coming back from GitHub: say how it went, once.
  useEffect(() => {
    const result = params.get('github');
    if (!result) return;
    const messages: Record<string, [string, 'success' | 'error' | 'info']> = {
      connected: [t('admin.github.connected_toast', 'GitHub connected'), 'success'],
      denied: [t('admin.github.denied', 'GitHub connection was cancelled'), 'info'],
      failed: [t('admin.github.failed', 'GitHub didn\'t accept the connection, try again'), 'error'],
      not_configured: [t('admin.github.no_app', 'Set up the GitHub sign-in app first (Access → Authentication), or paste a token instead'), 'error'],
    };
    const m = messages[result];
    if (m) showToast(m[0], m[1]);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('github'); return n; }, { replace: true });
  }, [params, setParams, t]);

  const saveToken = async () => {
    setBusy('token');
    try {
      const { data } = await api.post<{ login: string }>('/admin/github/token', { token });
      showToast(t('admin.github.connected_as', 'Connected as {{login}}', { login: data.login }), 'success');
      setToken(''); setShowToken(false);
      await load();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg) showToast(msg, 'error'); else toastApiError(err, t('admin.github.token_failed', 'That token didn\'t work'));
    } finally { setBusy(null); }
  };

  const saveRepos = async () => {
    setBusy('repos');
    try { await api.put('/admin/github/repos', repos); showToast(t('admin.github.repos_saved', 'Saved'), 'success'); await load(); }
    catch (err) { toastApiError(err, t('admin.github.repos_failed', 'Use the owner/name form, e.g. debridmediamanager/zurg')); }
    finally { setBusy(null); }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    try { await api.delete('/admin/github'); showToast(t('admin.github.disconnected', 'GitHub disconnected'), 'success'); await load(); }
    catch (err) { toastApiError(err, t('common.error', 'Something went wrong')); }
    finally { setBusy(null); }
  };

  if (!status) return null;
  const since = status.connectedAt ? new Date(status.connectedAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <section id="github">
      <h3 className="admin-group-label">GitHub</h3>
      <div className="admin-group divide-y divide-white/[0.06]">
        {status.connected ? (
          <div className="admin-row flex-wrap">
            {status.avatar
              ? <img src={status.avatar} alt="" className="w-8 h-8 rounded-lg flex-shrink-0" referrerPolicy="no-referrer" />
              : <span className="admin-icon-tile"><Github className="w-4 h-4" /></span>}
            <div className="flex-1 min-w-[12rem]">
              <p className="text-[15px] font-medium text-ndp-text">{t('admin.github.connected', 'Connected as {{login}}', { login: status.login })}</p>
              <p className="text-xs text-ndp-text-dim mt-0.5">
                {[status.source === 'oauth' ? t('admin.github.via_oauth', 'via GitHub sign-in') : t('admin.github.via_token', 'with a personal access token'),
                  since ? t('admin.github.since', 'since {{date}}', { date: since }) : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button type="button" onClick={() => setConfirmDisconnect(true)} disabled={!!busy} className="btn-secondary flex items-center gap-2 !px-3 !py-2 !text-sm">
              {busy === 'disconnect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              {t('admin.github.disconnect', 'Disconnect')}
            </button>
          </div>
        ) : (
          <div className="admin-row flex-wrap items-start">
            <span className="admin-icon-tile"><Github className="w-4 h-4" /></span>
            <div className="flex-1 min-w-[12rem]">
              <p className="text-[15px] font-medium text-ndp-text">{t('admin.github.not_connected', 'Not connected')}</p>
              <p className="text-xs text-ndp-text-dim mt-0.5 leading-relaxed">{t('admin.github.why', 'Connect the GitHub account that has access to the Zurg and rex repositories, and their pages will show when a new nightly is out.')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {status.oauthAvailable && (
                <a href="/api/auth/github/connect" className="btn-primary flex items-center gap-2 !px-3 !py-2 !text-sm">
                  <Github className="w-4 h-4" />{t('admin.github.connect', 'Connect with GitHub')}
                </a>
              )}
              <button type="button" onClick={() => setShowToken((v) => !v)} className="btn-secondary flex items-center gap-2 !px-3 !py-2 !text-sm">
                <KeyRound className="w-4 h-4" />{t('admin.github.use_token', 'Use a token')}
              </button>
            </div>
          </div>
        )}

        {!status.connected && showToken && (
          <div className="admin-row flex-col items-stretch gap-2">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_… / ghp_…" className="input w-full" autoComplete="off" />
            <p className="text-xs text-ndp-text-dim leading-relaxed">
              {t('admin.github.token_hint', 'A fine-grained token with read-only “Contents” access to just these two repositories is the narrowest option (it only works if your account can pick those repos). Otherwise a classic token with the “repo” scope.')}
            </p>
            <button type="button" onClick={() => void saveToken()} disabled={busy === 'token' || token.trim().length < 20} className="btn-primary self-start flex items-center gap-2 !px-3 !py-2 !text-sm">
              {busy === 'token' && <Loader2 className="w-4 h-4 animate-spin" />}{t('admin.github.save_token', 'Check and save')}
            </button>
          </div>
        )}

        <div className="admin-row flex-col items-stretch gap-2">
          <p className="text-sm text-ndp-text">{t('admin.github.repos', 'Repositories to watch')}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {(['zurg', 'rex'] as const).map((k) => (
              <label key={k} className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ndp-text-dim">{k}</span>
                <input value={repos[k]} onChange={(e) => setRepos((r) => ({ ...r, [k]: e.target.value }))} className="input w-full mt-1 !h-10" spellCheck={false} />
              </label>
            ))}
          </div>
          {(repos.zurg !== status.repos.zurg || repos.rex !== status.repos.rex) && (
            <button type="button" onClick={() => void saveRepos()} disabled={busy === 'repos'} className="btn-secondary self-start flex items-center gap-2 !px-3 !py-2 !text-sm">
              {busy === 'repos' && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save', 'Save')}
            </button>
          )}
        </div>
      </div>
      <p className="admin-hint">
        {t('admin.github.scope_note', 'LeMedia only reads release lists with this. GitHub sign-in can\'t be limited to read-only, so it asks for full access to your repositories, the token is stored encrypted, used only on the server, and Disconnect revokes it.')}
      </p>

      <ConfirmModal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={async () => { setConfirmDisconnect(false); await disconnect(); }}
        title={t('admin.github.disconnect_title', 'Disconnect GitHub?')}
        description={t('admin.github.disconnect_desc', 'LeMedia forgets the token (and asks GitHub to revoke it if it came from GitHub sign-in). The Zurg and rex pages stop showing updates.')}
        confirmLabel={t('admin.github.disconnect', 'Disconnect')}
        tone="danger"
      />
    </section>
  );
}
