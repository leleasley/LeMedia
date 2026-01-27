"use client";

import { useState } from "react";
import { UserPermissionsClient } from "@/components/Settings/Users/UserPermissionsClient";
import { NotificationsSettingsPage } from "@/components/Settings/NotificationsPage";
import { ProfileSettings } from "@/components/Profile/ProfileSettings";
import { MFAResetModal } from "@/components/Profile/MFAResetModal";
import { PasskeySettings } from "@/components/Profile/PasskeySettings";
import { UserSessionsPanel } from "@/components/Profile/UserSessionsPanel";
import { useToast } from "@/components/Providers/ToastProvider";

interface AssignedEndpoint {
  id: number;
  name: string;
  type: string;
}

interface ProfileSettingsPageClientProps {
  user: {
    username: string;
    email?: string | null;
    avatarUrl?: string | null;
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

type SettingsTabKey = "general" | "security" | "linked" | "notifications" | "permissions";

const tabOrder: Array<{ key: SettingsTabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "linked", label: "Linked Accounts" },
  { key: "notifications", label: "Notifications" },
  { key: "permissions", label: "Permissions" }
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

  return (
    <div className="min-h-screen">
      <div className="mt-10 text-white space-y-8">
        {activeTab === "general" && (
          <ProfileSettings
            section="general"
            accountTypeLabel={user.jellyfinUserId ? "Jellyfin User" : "Local User"}
            roleLabel={isAdmin ? "Owner" : "Member"}
          />
        )}

        {activeTab === "linked" && (
          <ProfileSettings section="linked" />
        )}

        {activeTab === "security" && (
          <div className="space-y-8">
            <ProfileSettings section="security" />

            <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 ring-1 ring-white/10">
                  <span className="text-xl">🔐</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Authenticator App (OTP)</h2>
                  <p className="text-sm text-gray-400 mt-1">Add an extra layer of security using Google Authenticator or Authy</p>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {mfaEnabled ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
                    MFA is currently enabled for your account.
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
                    MFA is not configured yet. You can reset to re-enroll now.
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-300">Reset will sign you out to complete re-enrollment.</div>
                  <MFAResetModal />
                </div>
              </div>
            </div>

            <PasskeySettings />

            <UserSessionsPanel />
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-6">
            <NotificationsSettingsPage />

            <WeeklyDigestSettings
              initialEnabled={!!user.weeklyDigestOptIn}
              email={user.email ?? null}
            />

            <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 ring-1 ring-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Admin-assigned channels</h2>
                  <p className="text-sm text-gray-400 mt-1">These are managed by administrators and cannot be changed here.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300">
                  Notification channels can only be configured by admins. Ask an administrator if you need to change how you&apos;re notified.
                </div>

                {assignedEndpoints.length ? (
                  <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20">
                    {assignedEndpoints.map(endpoint => (
                      <div key={endpoint.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <div className="font-semibold text-white">{endpoint.name}</div>
                          <div className="text-xs text-gray-500 mt-1 font-mono">{String(endpoint.type).toUpperCase()}</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-emerald-200">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                          Active
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-6 py-4 text-amber-200/90 text-sm flex items-center gap-3">
                    <span className="text-lg">⚠️</span>
                    No notification channels have been assigned to your account yet. Requests will remain blocked until an admin applies them.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "permissions" && (
          <UserPermissionsClient userId={user.userId} editable={false} variant="plain" />
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
    <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-xl">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 ring-1 ring-white/10">
          <span className="text-xl">📬</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Weekly Coming Soon Digest</h2>
          <p className="text-sm text-gray-400 mt-1">
            Get a weekly email with upcoming movie and TV releases.
          </p>
        </div>
      </div>

      {!email ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm mb-4">
          Add an email address in your profile to enable and test the digest.
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="grid gap-3 text-sm text-gray-300">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Status</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  enabled ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-gray-300"
                }`}
              >
                {enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Delivery</span>
              <span className="text-gray-200">{email ?? "No email set"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Schedule</span>
              <span className="text-gray-200">Weekly (Mondays)</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleToggle}
            disabled={loading || (!email && !enabled)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            {loading ? "Saving..." : enabled ? "Disable digest" : "Enable digest"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !email}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
          >
            {testing ? "Sending test..." : "Send test email"}
          </button>
          <p className="text-xs text-gray-400">
            Sends a one-time preview to your saved email address.
          </p>
        </div>
      </div>
    </div>
  );
}
