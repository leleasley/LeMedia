"use client";

import { FormEvent, useState, useCallback } from "react";
import { Modal } from "@/components/Common/Modal";
import { JellyfinImportModal } from "@/components/Settings/Jellyfin/JellyfinImportModal";
import { useToast } from "@/components/Providers/ToastProvider";
import { normalizeGroupList } from "@/lib/groups";
import { csrfFetch } from "@/lib/csrf-client";
import { formatDate } from "@/lib/dateFormat";
import { PasswordPolicyChecklist } from "@/components/Common/PasswordPolicyChecklist";
import { getPasswordPolicyResult } from "@/lib/password-policy";

type AdminUser = {
  id: number;
  username: string;
  email: string | null;
  groups: string[];
  created_at: string;
  last_seen_at: string;
  mfa_enabled: boolean;
  notificationEndpointIds: number[];
  weeklyDigestOptIn: boolean;
};

type ModalState = { mode: "create" } | { mode: "edit"; user: AdminUser };

type FormState = {
  username: string;
  email: string;
  groups: string;
  password: string;
  notificationEndpointIds: number[];
};

function parseGroups(value: string) {
  return normalizeGroupList(value);
}

type Endpoint = {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
};

export function UsersAdminPanel({ initialUsers, initialEndpoints }: { initialUsers: AdminUser[]; initialEndpoints: Endpoint[] }) {
  const toast = useToast();
  const [users, setUsers] = useState(initialUsers);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    username: "",
    email: "",
    groups: "users",
    password: "",
    notificationEndpointIds: []
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentUser = modal && modal.mode === "edit" ? modal.user : null;
  const modalTitle = modal?.mode === "edit" ? "Edit user" : "Create user";
  const actionLabel = modal?.mode === "edit" ? "Save" : "Create";

  const handleOpenCreate = () => {
    setFormState({ username: "", email: "", groups: "users", password: "", notificationEndpointIds: [] });
    setError(null);
    setModal({ mode: "create" });
  };

  const handleOpenEdit = (user: AdminUser) => {
    setFormState({
      username: user.username,
      email: user.email ?? "",
      groups: user.groups.join(", "),
      password: "",
      notificationEndpointIds: user.notificationEndpointIds ?? []
    });
    setError(null);
    setModal({ mode: "edit", user });
  };

  const handleClose = useCallback(() => {
    setModal(null);
  }, []);

  const toggleNotificationEndpoint = (endpointId: number) => {
    setFormState(prev => {
      const next = new Set(prev.notificationEndpointIds);
      if (next.has(endpointId)) next.delete(endpointId);
      else next.add(endpointId);
      return { ...prev, notificationEndpointIds: Array.from(next) };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modal) return;

    const trimmedUsername = formState.username.trim();
    if (!trimmedUsername) {
      setError("Username is required");
      return;
    }

    if (modal.mode === "create" && !formState.password) {
      setError("Password is required for new users");
      return;
    }
    if (formState.password) {
      const policy = getPasswordPolicyResult({ password: formState.password, username: trimmedUsername });
      if (policy.errors.length) {
        setError(policy.errors[0]);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    const parsedGroups = parseGroups(formState.groups);
    const payload: Record<string, unknown> = { username: trimmedUsername };
    if (modal.mode === "create") {
      payload.groups = parsedGroups.length ? parsedGroups : ["users"];
    } else {
      payload.groups = parsedGroups;
    }

    const emailValue = formState.email.trim();
    if (modal.mode === "create") {
      if (emailValue) {
        payload.email = emailValue;
      }
    } else {
      payload.email = emailValue;
    }

    if (formState.password) {
      payload.password = formState.password;
    }
    payload.notificationEndpointIds = formState.notificationEndpointIds ?? [];

    try {
      const res = await csrfFetch(modal.mode === "create" ? "/api/v1/users" : `/api/v1/users/${currentUser?.id}`, {
        method: modal.mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "Failed to save user");
      }

      const updatedUser = body.user as AdminUser;
      setUsers(prev => {
        if (modal.mode === "create") {
          return [updatedUser, ...prev];
        }
        return prev.map(user => (user.id === updatedUser.id ? updatedUser : user));
      });
      toast.success(modal.mode === "create" ? "User created" : "User updated");
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/v1/users/${user.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to delete user");
      }
      setUsers(prev => prev.filter(u => u.id !== user.id));
      toast.success("User deleted");
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetMfa = async (user: AdminUser) => {
    if (!confirm(`Reset MFA for "${user.username}"? They will be prompted to configure it again on next login.`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/v1/users/${user.id}/reset-mfa`, {
        method: "POST",
        credentials: "include"
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to reset MFA");
      }
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, mfa_enabled: false } : u)));
      toast.success("MFA reset");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/10 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Users</p>
          <h2 className="text-xl font-semibold text-white">User management</h2>
          <p className="text-sm text-muted">Create accounts, manage groups, and control access.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImportOpen(true)} className="btn flex-1 sm:flex-none">
            Import from Jellyfin
          </button>
          <button onClick={handleOpenCreate} className="btn flex-1 sm:flex-none">
            New user
          </button>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {users.map(user => (
          <div key={user.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-white">{user.username}</div>
                <div className="text-xs text-muted">{user.email ?? "—"}</div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${
                  user.mfa_enabled ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-muted"
                }`}
              >
                {user.mfa_enabled ? "MFA enabled" : "MFA not set"}
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {user.groups.length ? (
                user.groups.map(group => (
                  <span key={group} className="rounded-full bg-white/10 px-2 py-0.5 text-[0.6rem] font-semibold text-gray-200">
                    {group}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted">no groups</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-muted">
              <div>
                <div className="uppercase tracking-wider text-[0.6rem] text-muted">Notifications</div>
                <div className="mt-1">
                  {user.notificationEndpointIds?.length ? (
                    <span>{user.notificationEndpointIds.length} selected</span>
                  ) : (
                    <span className="text-amber-500 font-semibold">none (blocked)</span>
                  )}
                </div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-[0.6rem] text-muted">Last seen</div>
                <div className="mt-1">{formatDate(user.last_seen_at)}</div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-[0.6rem] text-muted">Created</div>
                <div className="mt-1">{formatDate(user.created_at)}</div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-[0.6rem] text-muted">Weekly digest</div>
                <div className="mt-1">
                  {!user.email ? (
                    <span className="text-amber-400 font-semibold">no email</span>
                  ) : user.weeklyDigestOptIn ? (
                    <span className="text-emerald-300 font-semibold">enabled</span>
                  ) : (
                    <span className="text-muted">disabled</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => handleOpenEdit(user)}
                className="btn btn-sm btn-ghost text-muted text-xs"
                disabled={submitting}
              >
                Edit
              </button>
              {user.mfa_enabled ? (
                <button
                  type="button"
                  onClick={() => handleResetMfa(user)}
                  className="btn btn-sm bg-red-500/10 hover:bg-red-500/20 text-red-200 text-xs"
                  disabled={submitting}
                >
                  Reset MFA
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-muted border-b border-white/10">
            <tr>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">Username</th>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">Email</th>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">Groups</th>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">Notifications</th>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">Weekly digest</th>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">MFA</th>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">Created</th>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">Last seen</th>
              <th className="p-4 text-xs uppercase tracking-[0.2em]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-semibold text-text">{user.username}</td>
                <td className="p-4 text-muted">{user.email ?? "—"}</td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {user.groups.length ? (
                      user.groups.map(group => (
                        <span
                          key={group}
                          className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-gray-200"
                        >
                          {group}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted">no groups</span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-muted">
                  {user.notificationEndpointIds?.length ? (
                    <span>{user.notificationEndpointIds.length} selected</span>
                  ) : (
                    <span className="text-xs text-amber-500 font-semibold">none (blocked)</span>
                  )}
                </td>
                <td className="p-4">
                  {!user.email ? (
                    <span className="text-xs font-semibold text-amber-400">No email</span>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${
                        user.weeklyDigestOptIn ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-muted"
                      }`}
                    >
                      {user.weeklyDigestOptIn ? "Enabled" : "Disabled"}
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${
                      user.mfa_enabled ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-muted"
                    }`}
                  >
                    {user.mfa_enabled ? "Enabled" : "Not setup"}
                  </span>
                </td>
                <td className="p-4 text-muted">{formatDate(user.created_at)}</td>
                <td className="p-4 text-muted">{formatDate(user.last_seen_at)}</td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleOpenEdit(user)}
                      className="btn btn-sm btn-ghost text-muted text-xs"
                      disabled={submitting}
                    >
                      Edit
                    </button>
                    {user.mfa_enabled ? (
                      <button
                        type="button"
                        onClick={() => handleResetMfa(user)}
                        className="btn btn-sm bg-red-500/10 hover:bg-red-500/20 text-red-200 text-xs"
                        disabled={submitting}
                      >
                        Reset MFA
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!modal} title={modalTitle} onClose={handleClose}>
        {modal ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Username</label>
              <input
                value={formState.username}
                onChange={event => setFormState(prev => ({ ...prev, username: event.target.value }))}
                placeholder="username"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Email</label>
              <input
                value={formState.email}
                onChange={event => setFormState(prev => ({ ...prev, email: event.target.value }))}
                placeholder="user@domain.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Groups</label>
              <select
                value={formState.groups}
                onChange={event => setFormState(prev => ({ ...prev, groups: event.target.value }))}
              >
                <option value="users">users</option>
                <option value="moderators">moderators</option>
                <option value="administrators">administrators</option>
                <option value="administrators, users">administrators, users</option>
              </select>
              <p className="text-xs text-muted">Choose the groups for this user.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Password</label>
                {modal.mode === "edit" ? <span className="text-xs text-muted">leave blank to keep</span> : null}
              </div>
              <input
                type="password"
                value={formState.password}
                onChange={event => setFormState(prev => ({ ...prev, password: event.target.value }))}
              />
              {formState.password ? (
                <PasswordPolicyChecklist
                  password={formState.password}
                  username={formState.username}
                  className="pt-2"
                />
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Notification channels</label>
                <span className="text-[0.65rem] uppercase tracking-[0.3em] text-muted">
                  Required to allow requests
                </span>
              </div>
              {initialEndpoints.length ? (
                <div className="space-y-2">
                  {initialEndpoints.map(endpoint => (
                    <label
                      key={endpoint.id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        endpoint.enabled ? "border-border bg-surface" : "border-border/50 bg-surface/50 opacity-60"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-text">{endpoint.name}</div>
                        <div className="text-xs text-muted">{endpoint.type.toUpperCase()}</div>
                        {!endpoint.enabled ? (
                          <div className="text-xs text-amber-500 font-semibold">Disabled</div>
                        ) : null}
                      </div>
                      <input
                        type="checkbox"
                        disabled={!endpoint.enabled}
                        checked={formState.notificationEndpointIds.includes(endpoint.id)}
                        onChange={() => toggleNotificationEndpoint(endpoint.id)}
                      />
                    </label>
                  ))}
                  {!formState.notificationEndpointIds.length ? (
                    <div className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Requests are blocked for this user until at least one channel is assigned.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
                  No notification endpoints exist yet. Create one first.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              {modal?.mode === "edit" ? (
                <button
                  type="button"
                  onClick={() => modal.mode === "edit" && handleDelete(modal.user)}
                  className="btn bg-red-500 hover:bg-red-600 text-white text-xs"
                  disabled={submitting}
                >
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleClose}
                className="btn bg-surface hover:bg-surface-strong text-muted text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn text-xs"
              >
                {submitting ? "Saving…" : actionLabel}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <JellyfinImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={async () => {
          try {
            const res = await fetch("/api/v1/users", { credentials: "include" });
            const body = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(body?.users)) {
              setUsers(body.users);
            }
          } catch {
            toast.error("Imported users, but failed to refresh list");
          }
        }}
      />
    </div>
  );
}
