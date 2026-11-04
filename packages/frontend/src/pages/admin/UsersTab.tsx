import { useState, useEffect, useCallback, useRef } from 'react';
import { avatarSrc } from '@/utils/avatarSrc';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle, RefreshCw, Trash2, Link, ChevronDown, UserX, UserCheck, RefreshCcw, Download, X, MailPlus, Send, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { showToast, extractApiError, toastApiError } from '@/utils/toast';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser } from '@/types';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useModal } from '@/hooks/useModal';
import { getProviderBadgeClass, getProviderHex } from '@/providers/colors';
import { startPlexPinFlow, type PlexPinFlowHandle } from '@/providers/plex/pinFlow';

type UserSort = 'username' | 'date' | 'role';

interface Role { id: number; name: string; position: number }

export function UsersTab() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<UserSort>('username');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const [deletingUser, setDeletingUser] = useState<number | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<number | null>(null);
  const confirmDeleteModal = useModal({
    open: confirmDeleteUser !== null,
    onClose: () => setConfirmDeleteUser(null),
  });
  const [linkingUser, setLinkingUser] = useState<number | null>(null);
  const [linkModal, setLinkModal] = useState<{ userId: number; provider: string } | null>(null);
  const [linkUsername, setLinkUsername] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkError, setLinkError] = useState('');
  const [authProviders, setAuthProviders] = useState<{ id: string; label: string; type: string }[]>([]);
  const [syncableProviders, setSyncableProviders] = useState<{ id: string; label: string; type: string }[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<number | null>(null);
  const [togglingDisabledFor, setTogglingDisabledFor] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    providerId: string;
    providerLabel: string;
    enabled: number;
    disabled: number;
    pendingImports: Array<{ providerId: string; providerUsername?: string | null; providerEmail?: string | null }>;
  } | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const flowRef = useRef<PlexPinFlowHandle | null>(null);

  // Invite-only creation
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);
  const [invites, setInvites] = useState<{ id: number; email: string; role: string; expiresAt: string; acceptedAt: string | null; createdAt: string; isExpired: boolean }[]>([]);

  const fetchUsers = useCallback(async () => {
    try {
      const { data: usersData } = await api.get('/admin/users');
      setUsers(usersData);
    } catch (err) { toastApiError(err, t('admin.users.load_failed')); }
    finally { setLoading(false); }
  }, [t]);

  const fetchInvites = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/invites');
      setInvites(data);
    } catch { /* silent */ }
  }, []);

  const handleDeleteUser = async (userId: number) => {
    setDeletingUser(userId);
    try {
      await api.delete(`/admin/danger/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      showToast(t('admin.users.deleted'), 'success');
    } catch (err) { toastApiError(err, t('admin.users.delete_failed')); }
    finally { setDeletingUser(null); }
  };

  useEffect(() => { fetchUsers(); fetchInvites(); }, [fetchUsers, fetchInvites]);
  useEffect(() => {
    api.get('/auth/providers')
      .then(({ data }) => setAuthProviders(data))
      .catch((err) => console.error('Failed to fetch auth providers:', err));
    // Sync buttons are driven by service availability, not SSO — fetched separately so admins
    // can sync a Plex service they've configured even with Plex SSO turned off.
    api.get('/admin/auth-providers/syncable')
      .then(({ data }) => setSyncableProviders(data))
      .catch((err) => console.error('Failed to fetch syncable providers:', err));
  }, []);
  useEffect(() => { api.get('/admin/roles').then(({ data }) => setRoles(data)).catch(() => {}); }, []);

  const handleChangeRole = async (userId: number, newRole: string) => {
    setUpdatingRoleFor(userId);
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      const code = extractApiError(err, '');
      const msg =
        code === 'CANNOT_DEMOTE_SELF' ? t('admin.users.cannot_demote_self', "You can't demote your own admin role.")
        : code === 'LAST_ADMIN_LOCK' ? t('admin.users.last_admin_lock', 'At least one active admin must remain.')
        : extractApiError(err, t('admin.users.role_change_failed', 'Failed to change role'));
      showToast(msg, 'error');
    } finally {
      setUpdatingRoleFor(null);
    }
  };

  const handleUnlinkProvider = async (userId: number, provider: string) => {
    try {
      await api.delete(`/admin/users/${userId}/providers/${provider}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, providers: (u.providers || []).filter(p => p.provider !== provider) } : u));
    } catch (err) {
      const code = extractApiError(err, '');
      const msg =
        code === 'LAST_AUTH_METHOD' ? t('admin.users.last_auth_method', 'Cannot unlink the last authentication method, set a password first.')
        : extractApiError(err, t('admin.users.unlink_failed', 'Failed to unlink provider'));
      showToast(msg, 'error');
    }
  };

  const handleToggleDisabled = async (userId: number, disabled: boolean) => {
    setTogglingDisabledFor(userId);
    try {
      await api.put(`/admin/users/${userId}/disabled`, { disabled });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, disabled } : u));
    } catch (err) {
      const code = extractApiError(err, '');
      const msg =
        code === 'LAST_ADMIN_LOCK' ? t('admin.users.last_admin_lock', 'At least one active admin must remain.')
        : extractApiError(err, t('admin.users.disable_failed', 'Failed to toggle account'));
      showToast(msg, 'error');
    } finally {
      setTogglingDisabledFor(null);
    }
  };

  useEffect(() => () => flowRef.current?.cancel(), []);

  const handleLinkPlex = (userId: number) => {
    setLinkingUser(userId);
    const authWindow = window.open('about:blank', 'PlexAuth', 'width=600,height=700');
    flowRef.current?.cancel();
    flowRef.current = startPlexPinFlow({
      authWindow,
      pinEndpoint: '/auth/plex/pin',
      checkEndpoint: `/admin/users/${userId}/link-provider`,
      checkPayload: { provider: 'plex' },
      // link-provider returns { success: true } once the link is created, not a token. The
      // helper interprets a non-null return as success — so we return the sentinel string
      // when linkData.success flips.
      extractToken: (res) => ((res as { success?: boolean })?.success ? 'ok' : null),
      onToken: () => {
        setLinkingUser(null);
        fetchUsers();
      },
      onError: () => setLinkingUser(null),
    });
  };

  const handleLinkCredentials = async () => {
    if (!linkModal) return;
    setLinkingUser(linkModal.userId);
    setLinkError('');
    try {
      await api.post(`/admin/users/${linkModal.userId}/link-provider`, {
        provider: linkModal.provider, username: linkUsername, password: linkPassword,
      });
      setLinkModal(null);
      setLinkUsername('');
      setLinkPassword('');
      fetchUsers();
    } catch (err) {
      setLinkError(extractApiError(err, t('login.error')));
    } finally {
      setLinkingUser(null);
    }
  };

  // Two-step flow: Sync reconciles existing accounts (enable/disable) and lists provider users
  // without an LeMedia account. The admin then opens a modal from the sync banner, cherry-picks
  // which to pull in, and confirms — avoids auto-creating random server members.
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return showToast(t('invite.error.INVALID_EMAIL'), 'error');
    setInviting(true);
    try {
      await api.post('/admin/invites', { email: inviteEmail.trim(), role: inviteRole });
      showToast(t('admin.users.invite_sent'), 'success');
      setInviteEmail('');
      fetchInvites();
    } catch (err) {
      const data = (err as { response?: { data?: { error?: string; message?: string } } }).response?.data;
      if (data?.error === 'EMAIL_DELIVERY_FAILED') {
        showToast(t('admin.users.invite_email_not_found', { email: inviteEmail.trim(), defaultValue: `Cannot send email to ${inviteEmail.trim()}, address doesn't exist or was rejected${data.message ? `: ${data.message}` : ''}` }), 'error');
      } else {
        toastApiError(err, t('admin.users.invite_failed'));
      }
    } finally { setInviting(false); }
  };

  const handleResendInvite = async (id: number) => {
    try {
      await api.post(`/admin/invites/${id}/resend`);
      showToast(t('admin.users.invite_resent'), 'success');
      fetchInvites();
    } catch (err) {
      const data = (err as { response?: { data?: { error?: string; message?: string } } }).response?.data;
      if (data?.error === 'EMAIL_DELIVERY_FAILED') {
        showToast(t('admin.users.invite_email_not_found', { email: '', defaultValue: `Cannot send email to this address, it doesn't exist or was rejected${data.message ? `: ${data.message}` : ''}` }), 'error');
      } else {
        toastApiError(err, t('admin.users.invite_resend_failed'));
      }
    }
  };

  const handleDeleteInvite = async (id: number) => {
    try {
      await api.delete(`/admin/invites/${id}`);
      setInvites((prev) => prev.filter((i) => i.id !== id));
      showToast(t('admin.users.invite_deleted'), 'success');
    } catch (err) { toastApiError(err, t('admin.users.invite_delete_failed')); }
  };

  const handleImport = async (providerId: string, providerIds?: string[]) => {
    setImporting(true); setImportResult(null);
    try {
      const { data } = await api.post(`/admin/users/import/${providerId}`, { providerIds });
      setImportResult(data);
      setImportModalOpen(false);
      setSyncResult(null); // pendingImports are now resolved, clear the sync banner
      fetchUsers();
      showToast(t('admin.users.import_done'), 'success');
    } catch (err) {
      showToast(extractApiError(err, t('admin.users.import_failed')), 'error');
      // Keep the modal open with the selection intact so the admin can retry.
    }
    finally { setImporting(false); }
  };

  const openImportModal = () => {
    if (!syncResult) return;
    setSelectedImportIds(new Set(syncResult.pendingImports.map((p) => p.providerId)));
    setImportModalOpen(true);
  };

  const toggleImportId = (providerId: string) => {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const toggleSelectAllImports = () => {
    if (!syncResult) return;
    if (selectedImportIds.size === syncResult.pendingImports.length) {
      setSelectedImportIds(new Set());
    } else {
      setSelectedImportIds(new Set(syncResult.pendingImports.map((p) => p.providerId)));
    }
  };

  const handleSync = async (providerId: string, providerLabel: string) => {
    setSyncing(true); setSyncResult(null); setImportResult(null);
    try {
      const { data } = await api.post(`/admin/users/sync/${providerId}`);
      setSyncResult({ providerId, providerLabel, ...data });
      fetchUsers();
      showToast(t('admin.users.sync_started'), 'info');
    } catch (err) {
      showToast(extractApiError(err, t('admin.users.sync_failed', { provider: providerLabel })), 'error');
    }
    finally { setSyncing(false); }
  };

  if (loading) return <Spinner />;

  const sortedUsers = [...users].sort((a, b) => {
    if (sortBy === 'username') return (a.displayName || a.email).localeCompare(b.displayName || b.email);
    if (sortBy === 'role') return a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return (
    <AdminTabLayout
      title={t('admin.users.count', { count: users.length })}
      actions={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {syncableProviders.map(p => (
            <button key={p.id} onClick={() => handleSync(p.id, p.label)} disabled={syncing} className="btn-secondary flex items-center gap-2 text-sm !px-3 sm:!px-4 min-h-[40px] whitespace-nowrap disabled:opacity-50">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              {t('admin.users.sync_provider', { provider: p.label })}
            </button>
          ))}
          <button
            onClick={() => { fetchUsers(); fetchInvites(); }}
            className="btn-secondary flex items-center justify-center gap-2 text-sm !px-3 sm:!px-4 min-h-[40px] min-w-[40px]"
            aria-label={t('common.refresh')}
          >
            <RefreshCw className="w-4 h-4" /> <span className="hidden sm:inline">{t('common.refresh')}</span>
          </button>
        </div>
      }
    >
      {/* Invite-only creation */}
      <section className="mb-8">
        <h3 className="admin-group-label flex items-center gap-1.5">
          <MailPlus className="w-3.5 h-3.5" /> {t('admin.users.invite_title')}
        </h3>
        <div className="admin-group divide-y divide-white/[0.06]">
          <div className="p-4">
            <p className="text-xs text-ndp-text-dim leading-relaxed mb-3">{t('admin.users.invite_desc')}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder={t('admin.users.invite_email_placeholder')} className="input w-full sm:flex-1 min-w-0" />
              <div className="flex gap-2">
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input flex-1 sm:flex-none sm:w-36 capitalize">
                  {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
                <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="btn-primary flex items-center justify-center gap-2 text-sm whitespace-nowrap !px-4 disabled:opacity-50">
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {t('admin.users.invite_send')}
                </button>
              </div>
            </div>
          </div>
          {invites.length > 0 && invites.filter(i => !i.acceptedAt).map((inv) => (
            <div key={inv.id} className="admin-row">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ndp-text truncate">{inv.email}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-ndp-text-dim">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {inv.isExpired ? <span className="text-ndp-danger">{t('admin.users.invite_expired')}</span> : <span>{t('admin.users.invite_expires', { date: new Date(inv.expiresAt).toLocaleString() })}</span>}
                  </span>
                  <span className="admin-chip capitalize">{inv.role}</span>
                  {!inv.isExpired && (
                    <span className="admin-chip bg-amber-500/15 text-amber-300"><Send className="w-2.5 h-2.5" /> {t('admin.users.invite_pending')}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 -mr-2">
                {inv.isExpired && (
                  <button onClick={() => handleResendInvite(inv.id)} className="btn-secondary text-xs flex items-center gap-1.5 !px-3 !py-0 min-h-[36px]">
                    <Send className="w-3 h-3" /> {t('admin.users.invite_resend')}
                  </button>
                )}
                <button onClick={() => handleDeleteInvite(inv.id)} className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="inline-flex items-center gap-0.5 p-0.5 mb-4 rounded-lg bg-ndp-surface ring-1 ring-inset ring-white/[0.06]">
        {([['username', t('admin.users.sort.name')], ['date', t('admin.users.sort.date')], ['role', t('admin.users.sort.role')]] as [UserSort, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSortBy(key)}
            className={clsx('px-3.5 min-h-[36px] rounded-md text-xs font-medium transition-colors', sortBy === key ? 'bg-white/[0.1] text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text')}>
            {label}
          </button>
        ))}
      </div>

      {syncResult && (
        <div className="p-4 bg-ndp-accent/[0.06] ring-1 ring-inset ring-ndp-accent/20 rounded-xl mb-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <RefreshCcw className="w-5 h-5 text-ndp-accent flex-shrink-0 mt-0.5" />
            <p className="flex-1 min-w-0 text-sm text-ndp-text-muted leading-relaxed">
              {t('admin.users.sync_complete', {
                provider: syncResult.providerLabel,
                enabled: syncResult.enabled,
                disabled: syncResult.disabled,
              })}
              {syncResult.pendingImports.length > 0 && ` · ${t('admin.users.sync_pending_count', { count: syncResult.pendingImports.length })}`}
            </p>
            <button onClick={() => setSyncResult(null)} aria-label={t('common.close')} className="w-10 h-10 -mt-2 -mr-2 flex items-center justify-center flex-shrink-0 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          {syncResult.pendingImports.length > 0 && (
            <div className="mt-3 sm:pl-8">
              <p className="text-xs text-ndp-text-dim mb-3">{t('admin.users.sync_pending_hint')}</p>
              <button
                onClick={openImportModal}
                className="btn-primary flex items-center justify-center gap-2 text-sm w-full sm:w-auto"
              >
                <Download className="w-4 h-4" />
                {t('admin.users.sync_review_cta', { count: syncResult.pendingImports.length })}
              </button>
            </div>
          )}
        </div>
      )}

      {importModalOpen && syncResult && createPortal(
        <div
          className="modal-overlay z-50"
          onClick={() => !importing && setImportModalOpen(false)}
        >
          <div
            className="modal-panel w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 sm:px-6 pt-6 pb-4 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold text-ndp-text flex items-center gap-2">
                <Download className="w-5 h-5 text-ndp-text-muted flex-shrink-0" />
                <span className="min-w-0">{t('admin.users.import_modal.title', { provider: syncResult.providerLabel })}</span>
              </h3>
              <p className="text-sm text-ndp-text-muted mt-1">
                {t('admin.users.import_modal.subtitle', { count: syncResult.pendingImports.length })}
              </p>
              <button
                onClick={toggleSelectAllImports}
                className="mt-2 -ml-1 px-1 min-h-[36px] text-xs font-medium text-ndp-accent hover:text-ndp-accent/80 transition-colors"
              >
                {selectedImportIds.size === syncResult.pendingImports.length
                  ? t('admin.users.import_modal.deselect_all')
                  : t('admin.users.import_modal.select_all')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-white/[0.06]">
              {syncResult.pendingImports.map((p) => {
                const checked = selectedImportIds.has(p.providerId);
                return (
                  <label
                    key={p.providerId}
                    className="flex items-center gap-3 px-5 sm:px-6 py-2.5 min-h-[52px] hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleImportId(p.providerId)}
                      className="w-5 h-5 accent-ndp-accent flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ndp-text truncate">{p.providerUsername || p.providerEmail || p.providerId}</p>
                      {p.providerEmail && p.providerUsername && (
                        <p className="text-xs text-ndp-text-dim truncate">{p.providerEmail}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="px-5 sm:px-6 pt-4 pb-5 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-xs text-ndp-text-dim">
                {t('admin.users.import_modal.selected_count', { count: selectedImportIds.size })}
              </span>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setImportModalOpen(false)}
                  disabled={importing}
                  className="btn-secondary text-sm"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleImport(syncResult.providerId, Array.from(selectedImportIds))}
                  disabled={importing || selectedImportIds.size === 0}
                  className="btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {t('admin.users.sync_import_cta', { count: selectedImportIds.size })}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {importResult && (
        <div className="p-4 bg-ndp-success/[0.06] ring-1 ring-inset ring-ndp-success/20 rounded-xl mb-4 animate-fade-in flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-ndp-success flex-shrink-0" />
          <p className="text-sm text-ndp-text-muted leading-relaxed">
            {t('admin.users.imported', { imported: importResult.imported, existing: importResult.skipped })}
          </p>
        </div>
      )}
      <div className="admin-group divide-y divide-white/[0.06]">
        {sortedUsers.map((u) => (
            <div key={u.id} className={clsx('flex flex-col gap-2.5 px-4 py-3.5 lg:flex-row lg:items-center lg:gap-4 transition-opacity', u.disabled && 'opacity-50')}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {u.avatar ? <img src={avatarSrc(u.avatar)} alt="" className="w-10 h-10 rounded-full flex-shrink-0 object-cover" /> : <div className="w-10 h-10 rounded-full flex-shrink-0 bg-white/[0.06] flex items-center justify-center text-ndp-text-muted font-semibold">{(u.displayName || u.email)[0].toUpperCase()}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-ndp-text truncate">{u.displayName || u.email}</span>
                    {u.disabled && (
                      <span className="admin-chip bg-ndp-danger/15 text-ndp-danger flex-shrink-0">
                        Disabled
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ndp-text-dim mt-0.5 block truncate">{u.email}</span>
                </div>
              </div>
              {/* Phones/tablets: metadata + controls drop to a second line under the name and wrap. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pl-[52px] lg:pl-0 lg:flex-nowrap lg:flex-shrink-0 lg:gap-3 min-w-0">
                {/* Group 1, provider badges + request count */}
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="text-xs text-ndp-text-dim tabular-nums whitespace-nowrap mr-1">{u.requestCount} {t('requests.title').toLowerCase()}</span>
                  {(u.providers || []).map((p) => (
                    <span key={p.provider} className="group relative inline-flex items-center max-w-full">
                      <span className={`admin-chip max-w-full min-w-0 ${getProviderBadgeClass(p.provider)}`} title={p.email && p.email !== u.email ? p.email : p.username || undefined}>
                        <span className="flex-shrink-0">{p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}</span>
                        {p.email && p.email !== u.email && <span className="opacity-60 truncate max-w-[9rem]">({p.email})</span>}
                      </span>
                      {/* Always visible on touch screens (no hover); hover-revealed on desktop. */}
                      <button
                        onClick={() => handleUnlinkProvider(u.id, p.provider)}
                        className="ml-0.5 inline-flex lg:hidden lg:group-hover:inline-flex items-center justify-center w-7 h-7 lg:w-5 lg:h-5 rounded-full text-ndp-text-dim hover:bg-ndp-danger/20 hover:text-ndp-danger flex-shrink-0"
                        title={t('admin.users.unlink', { provider: p.provider, defaultValue: 'Unlink {{provider}}' })}
                        aria-label={`Unlink ${p.provider}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <LinkProviderDropdown
                    userId={u.id}
                    userProviders={(u.providers || []).map(p => p.provider)}
                    authProviders={authProviders}
                    linking={linkingUser === u.id}
                    onLinkOAuth={(userId) => handleLinkPlex(userId)}
                    onLinkCredentials={(userId, providerId) => {
                      setLinkModal({ userId, provider: providerId });
                      setLinkUsername(''); setLinkPassword(''); setLinkError('');
                    }}
                  />
                </div>

                <span className="hidden lg:block h-5 w-px bg-white/10" aria-hidden />

                <div className="flex items-center gap-1 ml-auto lg:ml-0 -mr-2 lg:mr-0">
                  {/* Group 2, role */}
                  <RoleBadgeDropdown
                    user={u}
                    roles={roles}
                    disabled={u.id === currentUser?.id || roles.length === 0}
                    loading={updatingRoleFor === u.id}
                    onSelect={(role) => handleChangeRole(u.id, role)}
                  />

                  <span className="hidden lg:block h-5 w-px bg-white/10 mx-2" aria-hidden />

                  {/* Group 3a, toggle disabled (never available for self) */}
                  <button
                    onClick={() => handleToggleDisabled(u.id, !u.disabled)}
                    disabled={u.id === currentUser?.id || togglingDisabledFor === u.id}
                    className={clsx(
                      'w-10 h-10 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                      u.disabled
                        ? 'text-ndp-success hover:bg-ndp-success/10'
                        : 'text-ndp-text-dim hover:text-ndp-warning hover:bg-ndp-warning/10'
                    )}
                    title={u.disabled ? t('admin.users.enable_account', 'Re-enable account') : t('admin.users.disable_account', 'Disable account')}
                    aria-label={u.disabled ? t('admin.users.enable_account', 'Re-enable account') : t('admin.users.disable_account', 'Disable account')}
                  >
                    {togglingDisabledFor === u.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : u.disabled ? (
                      <UserCheck className="w-4 h-4" />
                    ) : (
                      <UserX className="w-4 h-4" />
                    )}
                  </button>

                  {/* Group 3b, delete (always visible, disabled for self) */}
                  <button
                    onClick={() => setConfirmDeleteUser(u.id)}
                    disabled={u.id === currentUser?.id || deletingUser === u.id}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors disabled:opacity-30 disabled:hover:text-ndp-text-dim disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    title={t('admin.danger.delete_user')}
                    aria-label={t('admin.danger.delete_user')}
                  >
                    {deletingUser === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
        ))}
      </div>

      {confirmDeleteUser && createPortal(
        <div className="modal-overlay z-50">
          <div
            ref={confirmDeleteModal.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmDeleteModal.titleId}
            className="modal-panel px-5 pt-7 pb-5 sm:p-6 max-w-sm w-full"
          >
            <h3 id={confirmDeleteModal.titleId} className="text-lg font-semibold text-ndp-text mb-2">{t('admin.danger.confirm_title')}</h3>
            <p className="text-sm text-ndp-text-muted leading-relaxed mb-1 break-words">
              {t('admin.users.confirm_delete', { name: users.find(u => u.id === confirmDeleteUser)?.displayName || users.find(u => u.id === confirmDeleteUser)?.email })}
            </p>
            <p className="text-xs text-ndp-text-dim leading-relaxed mb-6">
              {t('admin.users.confirm_delete_desc')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteUser(null)} className="btn-secondary text-sm">
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => { const userId = confirmDeleteUser; setConfirmDeleteUser(null); await handleDeleteUser(userId); }}
                disabled={deletingUser !== null}
                className="btn-danger text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t('admin.danger.delete_user')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Link credentials modal */}
      {linkModal && createPortal(
        <div className="modal-overlay z-50" onClick={() => setLinkModal(null)}>
          <div className="modal-panel w-full max-w-sm px-5 pt-7 pb-5 sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ndp-text mb-1">
              {t('admin.users.link_provider', { provider: authProviders.find(p => p.id === linkModal.provider)?.label || linkModal.provider })}
            </h3>
            <p className="text-xs text-ndp-text-dim mb-5 truncate">
              {users.find(u => u.id === linkModal.userId)?.displayName || users.find(u => u.id === linkModal.userId)?.email}
            </p>
            {linkError && (
              <div className="mb-3 px-3 py-2.5 bg-ndp-danger/10 ring-1 ring-inset ring-ndp-danger/20 rounded-lg text-ndp-danger text-xs break-words">{linkError}</div>
            )}
            <form onSubmit={e => { e.preventDefault(); handleLinkCredentials(); }} className="space-y-3">
              <input
                type="text"
                placeholder={t('login.username')}
                value={linkUsername}
                onChange={e => setLinkUsername(e.target.value)}
                className="input w-full"
                autoFocus
              />
              <input
                type="password"
                placeholder={t('login.password_placeholder')}
                value={linkPassword}
                onChange={e => setLinkPassword(e.target.value)}
                className="input w-full"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setLinkModal(null)} className="btn-secondary text-sm">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={linkingUser !== null || !linkUsername || !linkPassword}
                  className="btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {linkingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                  {t('admin.users.link')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </AdminTabLayout>
  );
}

// ─── Role Badge Dropdown ───────────────────────────────────────────

function RoleBadgeDropdown({ user, roles, disabled, loading, onSelect }: {
  user: AdminUser;
  roles: Role[];
  disabled: boolean;
  loading: boolean;
  onSelect: (role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = () => {
    if (disabled || loading) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Clamp so the menu never runs off the right edge on phones.
      setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 220 - 8)) });
    }
    setOpen(!open);
  };

  // Intentionally different visual from provider pills so admins see this as
  // an interactive control (rounded-lg + border + chevron), not just a label.
  // Fixed min-width + justify-between keeps the column aligned across rows
  // regardless of role name length or state (loading/disabled).
  const badgeClasses = clsx(
    'text-xs px-2.5 min-h-[36px] lg:min-h-[30px] rounded-lg font-medium capitalize inline-flex items-center gap-1.5 justify-between min-w-[88px] transition-colors border',
    user.role === 'admin'
      ? 'bg-ndp-accent/10 text-ndp-accent border-ndp-accent/25'
      : 'bg-white/[0.04] text-ndp-text-muted border-white/10',
    disabled
      ? 'opacity-60 cursor-default'
      : 'hover:bg-white/[0.08] hover:border-white/20 cursor-pointer',
  );

  return (
    <>
      <button ref={btnRef} onClick={toggle} disabled={disabled || loading} className={badgeClasses}>
        <span>{loading ? <Loader2 className="w-3 h-3 animate-spin" /> : user.role}</span>
        <ChevronDown
          className={clsx(
            'w-3 h-3 transition-transform shrink-0',
            disabled ? 'opacity-0' : 'opacity-70',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-ndp-surface-light border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden min-w-[180px] py-1"
          style={{ top: pos.top, left: pos.left }}
        >
          {roles.map(r => {
            const active = r.name === user.role;
            return (
              <button
                key={r.id}
                onClick={() => { setOpen(false); if (!active) onSelect(r.name); }}
                className={clsx(
                  'w-full flex items-center justify-between gap-2 px-3.5 min-h-[40px] text-sm transition-colors capitalize',
                  active ? 'text-ndp-accent font-medium' : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5',
                )}
              >
                <span>{r.name}</span>
                {active && <CheckCircle className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Link Provider Dropdown ────────────────────────────────────────

function LinkProviderDropdown({ userId, userProviders, authProviders, linking, onLinkOAuth, onLinkCredentials }: {
  userId: number;
  userProviders: string[];
  authProviders: { id: string; label: string; type: string }[];
  linking: boolean;
  onLinkOAuth: (userId: number) => void;
  onLinkCredentials: (userId: number, providerId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unlinked = authProviders.filter(ap => ap.id !== 'email' && !userProviders.includes(ap.id));
  if (unlinked.length === 0) return null;

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 200 - 8)) });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={linking}
        className="admin-chip min-h-[28px] px-2.5 border border-dashed border-white/15 !bg-transparent text-ndp-text-dim hover:!bg-white/5 hover:text-ndp-text-muted transition-colors"
      >
        {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
        {t('admin.users.link')}
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-ndp-surface-light border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden min-w-[160px] py-1"
          style={{ top: pos.top, left: pos.left }}
        >
          {unlinked.map(ap => {
            const color = getProviderHex(ap.id);
            return (
              <button
                key={ap.id}
                onClick={() => {
                  setOpen(false);
                  if (ap.type === 'oauth') onLinkOAuth(userId);
                  else onLinkCredentials(userId, ap.id);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 min-h-[40px] text-sm text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                {ap.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
