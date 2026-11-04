import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Shield, Plus, Pencil, Trash2, Loader2, Lock, Check, X } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { showToast, toastApiError } from '@/utils/toast';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useModal } from '@/hooks/useModal';

interface Role {
  id: number;
  name: string;
  permissions: string;
  isDefault: boolean;
  isSystem: boolean;
  position: number;
}

interface Permission {
  key: string;
  description: string;
  source: 'core' | 'plugin';
}

// Group permissions by prefix for cleaner display
function groupPermissions(perms: Permission[]): Record<string, Permission[]> {
  const groups: Record<string, Permission[]> = {};
  for (const p of perms) {
    const prefix = p.key.includes('.') ? p.key.split('.')[0] : 'other';
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(p);
  }
  return groups;
}

export function RolesTab() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);
  // When the backend reports the role is in use, we switch the same modal
  // into a "migrate users then delete" flow instead of failing silently.
  const [deleteBlocker, setDeleteBlocker] = useState<{ userCount: number } | null>(null);
  const [reassignTo, setReassignTo] = useState<string>('');

  // Edit form state
  const [formName, setFormName] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/admin/roles'),
        api.get('/admin/permissions'),
      ]);
      setRoles(rolesRes.data);
      setAllPermissions(permsRes.data);
    } catch (err) {
      toastApiError(err, t('admin.roles.load_failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setFormName('');
    setFormPermissions(['$authenticated', 'requests.read', 'requests.create']);
    setCreating(true);
    setEditingRole(null);
  };

  const openEdit = (role: Role) => {
    setFormName(role.name);
    setFormPermissions(JSON.parse(role.permissions) as string[]);
    setEditingRole(role);
    setCreating(false);
  };

  const closeModal = () => {
    setEditingRole(null);
    setCreating(false);
  };

  const togglePermission = (key: string) => {
    setFormPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const toggleWildcard = () => {
    setFormPermissions(prev =>
      prev.includes('*') ? prev.filter(p => p !== '*') : ['*']
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        await api.post('/admin/roles', { name: formName, permissions: formPermissions });
      } else if (editingRole) {
        await api.put(`/admin/roles/${editingRole.id}`, {
          ...(!editingRole.isSystem ? { name: formName } : {}),
          permissions: formPermissions,
        });
      }
      closeModal();
      await fetchData();
      showToast(t('common.saved'), 'success');
    } catch (err) {
      toastApiError(err, t('admin.roles.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const closeDeleteModal = () => {
    setConfirmDelete(null);
    setDeleteBlocker(null);
    setReassignTo('');
  };

  const handleDelete = async (opts?: { reassignTo?: string }) => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/roles/${confirmDelete.id}`, opts?.reassignTo ? { params: { reassignTo: opts.reassignTo } } : undefined);
      closeDeleteModal();
      await fetchData();
    } catch (err) {
      const resp = (err as { response?: { status?: number; data?: { error?: string; userCount?: number } } }).response;
      if (resp?.status === 409 && resp.data?.error === 'ROLE_IN_USE') {
        setDeleteBlocker({ userCount: resp.data.userCount ?? 0 });
        // Default the migration target to the system "default" role if any,
        // else the first non-self role.
        const fallback = roles.find(r => r.isDefault && r.id !== confirmDelete.id)
          ?? roles.find(r => r.id !== confirmDelete.id);
        setReassignTo(fallback?.name ?? '');
      } else {
        toastApiError(err, t('admin.roles.delete_failed'));
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (role: Role) => {
    try {
      await api.put(`/admin/roles/${role.id}`, { isDefault: true });
      await fetchData();
      showToast(t('common.saved'), 'success');
    } catch (err) {
      toastApiError(err, t('admin.roles.save_failed'));
    }
  };

  const isModalOpen = creating || !!editingRole;
  // Hooks must stay above the `if (loading)` early return.
  const editModal = useModal({ open: isModalOpen, onClose: closeModal });
  const confirmDeleteModal = useModal({ open: confirmDelete !== null, onClose: () => setConfirmDelete(null) });

  if (loading) return <Spinner />;

  const grouped = groupPermissions(allPermissions);
  const isWildcard = formPermissions.includes('*');

  return (
    <AdminTabLayout
      title={t('admin.roles.title', 'Roles')}
      count={roles.length}
      actions={
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm !px-4 whitespace-nowrap">
          <Plus className="w-4 h-4" />
          {t('admin.roles.create', 'New role')}
        </button>
      }
    >
      <div className="admin-group divide-y divide-white/[0.06]">
        {roles.map((role) => {
          const perms = JSON.parse(role.permissions) as string[];
          const isAll = perms.includes('*');

          return (
            <div key={role.id} className="admin-row flex-wrap gap-y-1">
              <div className={clsx(
                'admin-icon-tile !w-10 !h-10',
                isAll ? 'bg-ndp-accent/15 text-ndp-accent' : 'text-ndp-text-muted'
              )}>
                <Shield className="w-[18px] h-[18px]" />
              </div>

              {/* min-w forces the actions onto their own line on narrow phones instead of crushing the name. */}
              <div className="flex-1 min-w-[9rem]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-ndp-text capitalize truncate min-w-0 max-w-full">{role.name}</span>
                  {role.isSystem && (
                    <span className="admin-chip">
                      <Lock className="w-2.5 h-2.5" />
                      {t('admin.roles.system', 'System')}
                    </span>
                  )}
                  {role.isDefault && (
                    <span className="admin-chip bg-emerald-500/15 text-emerald-300">
                      {t('admin.roles.default', 'Default')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ndp-text-dim mt-0.5">
                  {isAll
                    ? t('admin.roles.all_permissions', 'All permissions')
                    : t('admin.roles.permission_count', '{{count}} permissions', { count: perms.filter(p => p !== '$authenticated').length })
                  }
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0 ml-auto -mr-2">
                {/* Never offer wildcard roles as default, would grant new users full admin. */}
                {!role.isDefault && !isAll && (
                  <button
                    onClick={() => handleSetDefault(role)}
                    className="text-xs font-medium px-3 min-h-[40px] rounded-lg text-ndp-text-muted hover:text-ndp-success hover:bg-ndp-success/10 transition-colors whitespace-nowrap"
                    title={t('admin.roles.set_default', 'Set as default')}
                  >
                    {t('admin.roles.set_default', 'Set as default')}
                  </button>
                )}
                <button
                  onClick={() => openEdit(role)}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {!role.isSystem && (
                  <button
                    onClick={() => setConfirmDelete(role)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && createPortal(
        <div className="modal-overlay z-50">
          <div
            ref={editModal.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={editModal.titleId}
            className="modal-panel max-w-lg w-full max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between gap-4 px-5 sm:px-6 pt-6 pb-4 border-b border-white/[0.06]">
              <h3 id={editModal.titleId} className="text-lg font-semibold text-ndp-text">
                {creating ? t('admin.roles.create', 'New role') : t('admin.roles.edit', 'Edit role')}
              </h3>
              <button onClick={closeModal} aria-label={t('common.close')} className="w-10 h-10 -mr-2 flex items-center justify-center flex-shrink-0 rounded-lg hover:bg-white/5 text-ndp-text-dim hover:text-ndp-text transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Name */}
            <div className="px-5 sm:px-6 pt-5 pb-4">
              <label htmlFor="role-name" className="text-xs text-ndp-text-muted mb-1.5 block font-medium">
                {t('admin.roles.name', 'Name')}
              </label>
              <input
                id="role-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={editingRole?.isSystem}
                placeholder="moderator"
                className="input w-full disabled:opacity-60"
              />
            </div>

            {/* Permissions */}
            <div className="px-5 sm:px-6 pb-4 flex-1 overflow-y-auto min-h-0">
              <label className="admin-group-label block">
                {t('admin.roles.permissions', 'Permissions')}
              </label>

              {/* Wildcard toggle */}
              <button
                onClick={toggleWildcard}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 min-h-[48px] rounded-lg mb-4 transition-colors text-left ring-1 ring-inset',
                  isWildcard ? 'bg-ndp-accent/10 text-ndp-accent ring-ndp-accent/25' : 'bg-white/[0.03] text-ndp-text ring-white/[0.06] hover:bg-white/[0.06]'
                )}
              >
                <div className={clsx(
                  'w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0',
                  isWildcard ? 'bg-ndp-accent border-ndp-accent' : 'border-white/25'
                )}>
                  {isWildcard && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm font-semibold">{t('admin.roles.all_permissions', 'All permissions')} (*)</span>
              </button>

              {/* Grouped permissions */}
              {!isWildcard && Object.entries(grouped).map(([group, perms]) => (
                <div key={group} className="mb-4">
                  <p className="admin-group-label">
                    {group}
                  </p>
                  <div className="rounded-lg ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
                    {perms.map((perm) => {
                      const active = formPermissions.includes(perm.key);
                      return (
                        <button
                          key={perm.key}
                          onClick={() => togglePermission(perm.key)}
                          className={clsx(
                            'w-full flex items-start gap-3 px-3 py-2.5 min-h-[48px] transition-colors text-left',
                            active ? 'bg-ndp-accent/[0.07] text-ndp-text' : 'text-ndp-text-muted hover:bg-white/[0.04]'
                          )}
                        >
                          <div className={clsx(
                            'w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0 mt-0.5',
                            active ? 'bg-ndp-accent border-ndp-accent' : 'border-white/25'
                          )}>
                            {active && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-xs font-mono break-all">{perm.key}</span>
                              {perm.source === 'plugin' && (
                                <span className="admin-chip bg-sky-500/15 text-sky-300 !text-[10px]">
                                  plugin
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-ndp-text-dim mt-0.5 leading-snug">{perm.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 px-5 sm:px-6 pt-4 pb-5 border-t border-white/[0.06]">
              <button onClick={closeModal} className="btn-secondary text-sm">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (!creating && !editingRole) || (!formName.trim() && creating)}
                className="btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirmation, switches to a "migrate then delete" flow when
          the backend reports the role is still assigned to users. */}
      {confirmDelete && createPortal(
        <div className="modal-overlay z-50">
          <div
            ref={confirmDeleteModal.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmDeleteModal.titleId}
            className="modal-panel px-5 pt-7 pb-5 sm:p-6 max-w-sm w-full"
          >
            {deleteBlocker ? (
              <>
                <h3 id={confirmDeleteModal.titleId} className="text-lg font-semibold text-ndp-text mb-2">
                  {t('admin.roles.in_use_title', 'Role still in use')}
                </h3>
                <p className="text-sm text-ndp-text-muted leading-relaxed mb-1">
                  {t('admin.roles.in_use_desc', '{{count}} user(s) still have the role "{{name}}". Pick a role to migrate them to before deleting.', { count: deleteBlocker.userCount, name: confirmDelete.name })}
                </p>
                <label className="text-xs text-ndp-text-muted mt-4 mb-1.5 block font-medium">
                  {t('admin.roles.reassign_to', 'Migrate users to')}
                </label>
                <select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  className="input w-full text-sm capitalize mb-6"
                >
                  {roles
                    .filter(r => r.id !== confirmDelete.id)
                    .map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name}{r.isDefault ? `, ${t('admin.roles.default', 'Default')}` : ''}
                      </option>
                    ))}
                </select>
                <div className="flex justify-end gap-2">
                  <button onClick={closeDeleteModal} className="btn-secondary text-sm">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => handleDelete({ reassignTo })}
                    disabled={deleting || !reassignTo}
                    className="btn-danger text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t('admin.roles.migrate_and_delete', 'Migrate & delete')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-ndp-text mb-2">{t('admin.danger.confirm_title')}</h3>
                <p className="text-sm text-ndp-text-muted leading-relaxed mb-6">
                  {t('admin.roles.confirm_delete', 'Are you sure you want to delete the role "{{name}}"?', { name: confirmDelete.name })}
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={closeDeleteModal} className="btn-secondary text-sm">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => handleDelete()}
                    disabled={deleting}
                    className="btn-danger text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t('common.delete', 'Delete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </AdminTabLayout>
  );
}
