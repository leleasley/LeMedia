"use client";

import { useState } from "react";
import useSWR from "swr";
import { UserPermissionsClient } from "@/components/Settings/Users/UserPermissionsClient";
import { NotificationsSettingsPage } from "@/components/Settings/NotificationsPage";
import { ProfileSettings } from "@/components/Profile/ProfileSettings";
import { MFAResetModal } from "@/components/Profile/MFAResetModal";
import { PasskeySettings } from "@/components/Profile/PasskeySettings";
import { UserSessionsPanel } from "@/components/Profile/UserSessionsPanel";
import { useToast } from "@/components/Providers/ToastProvider";
import { LinkedAccountsPanel } from "@/components/LinkedAccounts/LinkedAccountsPanel";
import { csrfFetch } from "@/lib/csrf-client";
import { Modal } from "@/components/Common/Modal";
import { TelegramBotPanel } from "@/components/Profile/TelegramBotPanel";

interface AssignedEndpoint {
  id: number;
  name: string;
  type: string;
}

interface ProfileSettingsPageClientProps {
  user: {
    username: string;
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    avatarVersion?: number | null;
    jellyfinUserId?: string | null;
    createdAt?: string;
    userId?: number;
    groups?: string[];
    weeklyDigestOptIn?: boolean;
  };
  isAdmin: boolean;
  mfaEnabled: boolean;
  assignedEndpoints: AssignedEndpoint[];
  activeTab?: SettingsTabKey;
}

type SettingsTabKey = "general" | "security" | "linked" | "notifications" | "permissions" | "bot";

type Credential = {
  id: string;
  name?: string | null;
  deviceType: string;
  created_at: string;
};

type SessionRow = {
  jti: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
};

type SessionsResponse = {
  currentJti: string | null;
  sessions: SessionRow[];
};

const securityFetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => res.json());

type PushPreference = {
  enabled: boolean;
};

const tabOrder: Array<{ key: SettingsTabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "linked", label: "Linked Accounts" },
  { key: "notifications", label: "Notifications" },
  { key: "permissions", label: "Permissions" },
  { key: "bot", label: "Telegram Bot" }
];

export function ProfileSettingsPageClient({
  user,
  isAdmin,
  mfaEnabled,
  assignedEndpoints,
  activeTab: activeTabProp
}: ProfileSettingsPageClientProps) {
  const normalizedTab = (activeTabProp as string | undefined) === "password" ? "security" : activeTabProp;
  const activeTab = tabOrder.some(tab => tab.key === normalizedTab) ? (normalizedTab as SettingsTabKey) : "general";
  const { data: passkeysData } = useSWR<Credential[]>("/api/auth/webauthn/credentials", securityFetcher);
  const { data: sessionsData } = useSWR<SessionsResponse>("/api/profile/sessions", securityFetcher);
  const { data: apiTokenData, mutate: mutateApiToken, isLoading: apiTokenLoading } = useSWR<{ token: string | null }>("/api/profile/api-token", securityFetcher);
  const [apiTokenVisible, setApiTokenVisible] = useState(false);
  const [apiTokenSaving, setApiTokenSaving] = useState(false);
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [passwordPromptValue, setPasswordPromptValue] = useState("");
  const [passwordPromptError, setPasswordPromptError] = useState<string | null>(null);
  const [passwordPromptAction, setPasswordPromptAction] = useState<null | ((password: string) => Promise<void>)>(null);
  const toast = useToast();

  const passkeyCount = passkeysData ? passkeysData.length : null;
  const activeSessions = sessionsData ? sessionsData.sessions.filter(session => !session.revokedAt).length : null;
  const showAllClear = mfaEnabled && passkeyCount !== null && passkeyCount > 0 && activeSessions !== null && activeSessions <= 2;
  const showLoading = passkeyCount === null || activeSessions === null;

  // Notifications data
  const { data: pushData } = useSWR<PushPreference>("/api/push/preference", securityFetcher);
  const pushEnabled = pushData?.enabled ?? null;

  const apiToken = apiTokenData?.token ?? null;

  function requestPassword(action: (password: string) => Promise<void>) {
    setPasswordPromptValue("");
    setPasswordPromptError(null);
    setPasswordPromptAction(() => action);
    setPasswordPromptOpen(true);
  }

  async function rotateApiToken() {
    requestPassword(async (password) => {
      if (!password) throw new Error("Password is required");
      setApiTokenSaving(true);
      try {
        const res = await csrfFetch("/api/profile/api-token", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || "Failed to rotate API token");
        }
        toast.success(apiToken ? "API token rotated" : "API token generated");
        mutateApiToken();
        setPasswordPromptOpen(false);
      } finally {
        setApiTokenSaving(false);
      }
    });
  }

  async function revokeApiToken() {
    requestPassword(async (password) => {
      if (!password) throw new Error("Password is required");
      setApiTokenSaving(true);
      try {
        const res = await csrfFetch("/api/profile/api-token", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || "Failed to revoke API token");
        }
        toast.success("API token revoked");
        mutateApiToken();
        setPasswordPromptOpen(false);
      } finally {
        setApiTokenSaving(false);
      }
    });
  }

  return (
    <div className="min-h-screen">
      <Modal
        open={passwordPromptOpen}
        title="Confirm with password"
        onClose={() => {
          if (apiTokenSaving) return;
          setPasswordPromptOpen(false);
          setPasswordPromptValue("");
          setPasswordPromptError(null);
          setPasswordPromptAction(null);
        }}
        forceCenter
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-300">Enter your current password to continue.</p>
          <input
            type="password"
            autoComplete="current-password"
            value={passwordPromptValue}
            onChange={(event) => {
              setPasswordPromptValue(event.target.value);
              setPasswordPromptError(null);
            }}
            className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
            placeholder="Current password"
          />
          {passwordPromptError ? <p className="text-xs text-red-300">{passwordPromptError}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPasswordPromptOpen(false);
                setPasswordPromptValue("");
                setPasswordPromptError(null);
                setPasswordPromptAction(null);
              }}
              disabled={apiTokenSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (!passwordPromptAction) return;
                try {
                  await passwordPromptAction(passwordPromptValue);
                } catch (err: any) {
                  setPasswordPromptError(err?.message ?? "Password validation failed");
                }
              }}
              disabled={apiTokenSaving || !passwordPromptValue}
            >
              {apiTokenSaving ? "Verifying..." : "Continue"}
            </button>
          </div>
        </div>
      </Modal>
      <div className="mt-10 text-white space-y-8">
        {activeTab === "general" && (
          <ProfileSettings
            section="general"
            accountTypeLabel={user.jellyfinUserId ? "Jellyfin User" : "Local User"}
            roleLabel={isAdmin ? "Owner" : "Member"}
          />
        )}

        {activeTab === "linked" && (
          <LinkedAccountsPanel mode="self" />
        )}

        {activeTab === "security" && (
          <div className="space-y-8">
            {/* Security Header */}
            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent p-6 md:p-8">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 ring-1 ring-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Security Center</h1>
                    <p className="text-sm text-white/60 mt-1">Manage your account security settings</p>
                  </div>
                </div>

                {/* Security Status Cards */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-xl bg-black/20 border border-white/5 p-4">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${mfaEnabled ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                      <span className="text-lg">{mfaEnabled ? '✓' : '!'}</span>
                    </div>
                    <div>
                      <div className="text-xs text-white/50 uppercase tracking-wider">MFA</div>
                      <div className={`font-semibold ${mfaEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {mfaEnabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl bg-black/20 border border-white/5 p-4">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${passkeyCount && passkeyCount > 0 ? 'bg-emerald-500/20' : 'bg-white/10'}`}>
                      <span className="text-lg">{passkeyCount && passkeyCount > 0 ? '🔑' : '○'}</span>
                    </div>
                    <div>
                      <div className="text-xs text-white/50 uppercase tracking-wider">Passkeys</div>
                      <div className={`font-semibold ${passkeyCount && passkeyCount > 0 ? 'text-emerald-300' : 'text-white/70'}`}>
                        {passkeyCount === null ? 'Loading...' : passkeyCount > 0 ? `${passkeyCount} saved` : 'None'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl bg-black/20 border border-white/5 p-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10">
                      <span className="text-lg">💻</span>
                    </div>
                    <div>
                      <div className="text-xs text-white/50 uppercase tracking-wider">Sessions</div>
                      <div className="font-semibold text-white/90">
                        {activeSessions === null ? 'Loading...' : `${activeSessions} active`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risk Alerts */}
                {(!showAllClear && !showLoading) && (
                  <div className="mt-4 space-y-2">
                    {!mfaEnabled && (
                      <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-200">
                        <span>⚠️</span>
                        <span>Enable MFA to protect your account from unauthorized access</span>
                      </div>
                    )}
                    {passkeyCount === 0 && (
                      <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-200">
                        <span>⚠️</span>
                        <span>Add a passkey for faster, phishing-resistant logins</span>
                      </div>
                    )}
                    {activeSessions !== null && activeSessions > 2 && (
                      <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-200">
                        <span>⚠️</span>
                        <span>{activeSessions} active sessions - review and revoke any you don&apos;t recognize</span>
                      </div>
                    )}
                  </div>
                )}
                {showAllClear && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-200">
                    <span>✅</span>
                    <span>Your account security looks great!</span>
                  </div>
                )}
              </div>
            </div>

            {/* Password Section */}
            <ProfileSettings section="security" />

            {/* API Token Section */}
            <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 ring-1 ring-white/10">
                  <span className="text-xl">🔑</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">Personal API token</h3>
                  <p className="text-sm text-gray-400 mt-1">Use this for per-user integrations without sharing the global token</p>
                </div>
              </div>

              <div className="space-y-3">
                {apiToken ? (
                  <div className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded overflow-hidden">
                    <code className="text-sm text-white break-all block overflow-wrap-anywhere" style={{ wordBreak: 'break-all' }}>
                      {apiTokenVisible ? apiToken : apiToken.replace(/./g, '•')}
                    </code>
                  </div>
                ) : (
                  <div className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded text-muted italic text-sm">
                    {apiTokenLoading ? "Loading…" : "Generate a token to enable"}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn flex-1 sm:flex-none"
                    onClick={() => setApiTokenVisible(prev => !prev)}
                    disabled={!apiToken}
                  >
                    {apiTokenVisible ? "Hide" : "Reveal"}
                  </button>
                  <button
                    type="button"
                    className="btn flex-1 sm:flex-none"
                    onClick={async () => {
                      if (!apiToken) return;
                      try {
                        await navigator.clipboard.writeText(apiToken);
                        toast.success("API token copied");
                      } catch {
                        toast.error("Failed to copy API token");
                      }
                    }}
                    disabled={!apiToken}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn flex-1 sm:flex-none"
                    disabled={apiTokenSaving}
                    onClick={() => {
                      if (!apiToken) {
                        void rotateApiToken();
                        return;
                      }
                      if (!confirm("Rotate your personal API token? Existing integrations will stop working.")) return;
                      void rotateApiToken();
                    }}
                  >
                    {apiToken ? "Rotate" : "Generate"}
                  </button>
                  <button
                    type="button"
                    className="btn-danger flex-1 sm:flex-none"
                    disabled={!apiToken || apiTokenSaving}
                    onClick={() => {
                      if (!apiToken) return;
                      if (!confirm("Revoke your personal API token? This cannot be undone.")) return;
                      void revokeApiToken();
                    }}
                  >
                    Revoke
                  </button>
                </div>
                <p className="text-xs text-muted">
                  Requests made with this token follow your role. Admins auto-approve; members require approval.
                </p>
              </div>
            </div>

            {/* MFA Section */}
            <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ring-1 ring-white/10">
                  <span className="text-xl">🔐</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">Two-Factor Authentication</h3>
                  <p className="text-sm text-gray-400 mt-1">Add an extra layer of security using an authenticator app</p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${mfaEnabled ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}>
                  {mfaEnabled ? 'Active' : 'Inactive'}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-black/20 border border-white/5">
                <div className="text-sm text-gray-300">
                  {mfaEnabled
                    ? 'Your account is protected with two-factor authentication.'
                    : 'Protect your account by requiring a verification code when signing in.'}
                </div>
                <MFAResetModal />
              </div>
            </div>

            {/* Passkeys Section */}
            <PasskeySettings />

            {/* Sessions Section */}
            <UserSessionsPanel />
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-8">
            {/* Notifications Header */}
            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent p-6 md:p-8">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 ring-1 ring-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-300">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Notification Center</h1>
                    <p className="text-sm text-white/60 mt-1">Manage how and when you receive notifications</p>
                  </div>
                </div>

                {/* Status Cards */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-xl bg-black/20 border border-white/5 p-4">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${pushEnabled ? 'bg-emerald-500/20' : 'bg-white/10'}`}>
                      <span className="text-lg">{pushEnabled ? '🔔' : '🔕'}</span>
                    </div>
                    <div>
                      <div className="text-xs text-white/50 uppercase tracking-wider">Push</div>
                      <div className={`font-semibold ${pushEnabled ? 'text-emerald-300' : 'text-white/70'}`}>
                        {pushEnabled === null ? 'Loading...' : pushEnabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl bg-black/20 border border-white/5 p-4">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${user.weeklyDigestOptIn ? 'bg-emerald-500/20' : 'bg-white/10'}`}>
                      <span className="text-lg">📬</span>
                    </div>
                    <div>
                      <div className="text-xs text-white/50 uppercase tracking-wider">Digest</div>
                      <div className={`font-semibold ${user.weeklyDigestOptIn ? 'text-emerald-300' : 'text-white/70'}`}>
                        {user.weeklyDigestOptIn ? 'Weekly' : 'Disabled'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl bg-black/20 border border-white/5 p-4">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${assignedEndpoints.length > 0 ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                      <span className="text-lg">{assignedEndpoints.length > 0 ? '📡' : '⚠️'}</span>
                    </div>
                    <div>
                      <div className="text-xs text-white/50 uppercase tracking-wider">Channels</div>
                      <div className={`font-semibold ${assignedEndpoints.length > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {assignedEndpoints.length > 0 ? `${assignedEndpoints.length} active` : 'None'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status message */}
                {assignedEndpoints.length === 0 && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-200">
                    <span>⚠️</span>
                    <span>No admin channels assigned - ask an administrator to enable notifications for your account</span>
                  </div>
                )}
              </div>
            </div>

            {/* Web Push Notifications */}
            <NotificationsSettingsPage initialEnabled={pushEnabled} />

            {/* Weekly Digest */}
            <WeeklyDigestSettings
              initialEnabled={!!user.weeklyDigestOptIn}
              email={user.email ?? null}
            />

            {/* Admin-assigned Channels */}
            <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-slate-500/20 to-gray-500/20 ring-1 ring-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="M9 12l2 2 4-4"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">Admin Channels</h3>
                  <p className="text-sm text-gray-400 mt-1">Notification channels managed by administrators</p>
                </div>
                {assignedEndpoints.length > 0 && (
                  <div className="rounded-full px-3 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-200">
                    {assignedEndpoints.length} Active
                  </div>
                )}
              </div>

              {assignedEndpoints.length > 0 ? (
                <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                  {assignedEndpoints.map(endpoint => (
                    <div key={endpoint.id} className="flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5">
                          <span className="text-base">
                            {endpoint.type === 'discord' && '💬'}
                            {endpoint.type === 'email' && '📧'}
                            {endpoint.type === 'telegram' && '✈️'}
                            {endpoint.type === 'slack' && '💼'}
                            {endpoint.type === 'webhook' && '🔗'}
                            {!['discord', 'email', 'telegram', 'slack', 'webhook'].includes(endpoint.type) && '📡'}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-white">{endpoint.name}</div>
                          <div className="text-xs text-gray-500 uppercase tracking-wider">{endpoint.type}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs text-emerald-200 font-medium">Active</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
                  <div className="text-3xl mb-3 opacity-30">📡</div>
                  <p className="text-gray-400 text-sm">No channels assigned</p>
                  <p className="text-gray-500 text-xs mt-1">Contact an admin to set up notification channels</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "permissions" && (
          <UserPermissionsClient userId={user.userId} editable={false} variant="plain" />
        )}

        {activeTab === "bot" && (
          <TelegramBotPanel />
        )}
      </div>
    </div>
  );
}

function WeeklyDigestSettings({
  initialEnabled,
  email
}: {
  initialEnabled: boolean;
  email: string | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  const handleToggle = async () => {
    setLoading(true);
    try {
      const csrfRes = await fetch("/api/csrf");
      const { token } = await csrfRes.json();

      const res = await fetch("/api/profile/weekly-digest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update preference");
      }
      setEnabled(data.enabled);
      toast.success(data.enabled ? "Weekly digest enabled" : "Weekly digest disabled");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update preference");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!email) {
      toast.error("Add an email address to send a test digest.");
      return;
    }
    setTesting(true);
    try {
      const csrfRes = await fetch("/api/csrf");
      const { token } = await csrfRes.json();
      const res = await fetch("/api/profile/weekly-digest/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to send test digest");
      }
      toast.success("Test digest sent to your email.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to send test digest");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-white/10">
          <span className="text-xl">📬</span>
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white">Weekly Digest</h3>
          <p className="text-sm text-gray-400 mt-1">Get upcoming releases delivered to your inbox</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
          enabled ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-gray-300'
        }`}>
          {enabled ? 'Active' : 'Inactive'}
        </div>
      </div>

      {/* Main toggle area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-black/20 border border-white/5 mb-5">
        <div>
          <div className="text-sm text-white font-medium mb-1">
            {enabled ? 'Weekly digest is enabled' : 'Weekly digest is disabled'}
          </div>
          <div className="text-xs text-gray-400">
            {enabled
              ? `Sent every Monday to ${email || 'your email'}`
              : 'Enable to receive a curated list of upcoming releases'}
          </div>
        </div>
        <div className="flex gap-2">
          {enabled && email && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {testing ? 'Sending...' : 'Send test'}
            </button>
          )}
          <button
            onClick={handleToggle}
            disabled={loading || (!email && !enabled)}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              enabled
                ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {loading ? 'Saving...' : enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {/* No email warning */}
      {!email && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-center gap-3">
          <span>⚠️</span>
          <span>Add an email address in your profile to enable the weekly digest</span>
        </div>
      )}

      {/* Info when enabled */}
      {email && (
        <div className="rounded-lg bg-white/5 border border-white/5 p-4">
          <div className="flex items-start gap-3">
            <span className="text-white/40">📅</span>
            <div className="text-xs text-gray-400 space-y-1">
              <p>Includes movies and TV shows releasing in the upcoming week</p>
              <p>Delivered every Monday morning to {email}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
