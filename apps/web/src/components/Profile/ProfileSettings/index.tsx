"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { Loader2, Film, Tv, RefreshCw } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf-client";
import { Modal } from "@/components/Common/Modal";
import { RegionSelector } from "@/components/Common/RegionSelector";
import { LanguageSelector } from "@/components/Common/LanguageSelector";
import { Switch } from "@headlessui/react";
import { PasswordPolicyChecklist } from "@/components/Common/PasswordPolicyChecklist";
import { getPasswordPolicyResult } from "@/lib/password-policy";
import { formatDate } from "@/lib/dateFormat";

type ProfileResponse = {
  user: {
    username: string;
    displayName?: string | null;
    email: string | null;
    jellyfinUserId?: string | null;
    jellyfinUsername?: string | null;
    discordUserId?: string | null;
    letterboxdUsername?: string | null;
    traktUsername?: string | null;
    traktLinked?: boolean;
    traktTokenExpiresAt?: string | null;
    avatarUrl?: string | null;
    avatarVersion?: number | null;
    discoverRegion?: string | null;
    originalLanguage?: string | null;
    watchlistSyncMovies?: boolean;
    watchlistSyncTv?: boolean;
    requestLimitMovie?: number | null;
    requestLimitMovieDays?: number | null;
    requestLimitSeries?: number | null;
    requestLimitSeriesDays?: number | null;
  };
};

type UpdateResponse = {
  user: {
    username: string;
    displayName?: string | null;
    email: string | null;
    discordUserId?: string | null;
    letterboxdUsername?: string | null;
    traktUsername?: string | null;
    discoverRegion?: string | null;
    originalLanguage?: string | null;
    watchlistSyncMovies?: boolean;
    watchlistSyncTv?: boolean;
  };
  requireLogout: boolean;
};

type FormState = {
  username: string;
  displayName: string;
  email: string;
  discordUserId: string;
  letterboxdUsername: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  discoverRegion: string | null;
  originalLanguage: string | null;
  watchlistSyncMovies: boolean;
  watchlistSyncTv: boolean;
};

type ApiTokenInfo = {
  id: number;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const initialForm: FormState = {
  username: "",
  displayName: "",
  email: "",
  discordUserId: "",
  letterboxdUsername: "",
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  discoverRegion: null,
  originalLanguage: null,
  watchlistSyncMovies: false,
  watchlistSyncTv: false,
};

type ProfileSettingsSection = "all" | "general" | "linked" | "security";

type ProfileSettingsProps = {
  section?: ProfileSettingsSection;
  accountTypeLabel?: string | null;
  roleLabel?: string | null;
};

export function ProfileSettings({
  section = "all",
  accountTypeLabel,
  roleLabel
}: ProfileSettingsProps) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requireLogout, setRequireLogout] = useState(false);
  const [initialData, setInitialData] = useState<ProfileResponse['user'] | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [jellyfinLinked, setJellyfinLinked] = useState(false);
  const [traktLinked, setTraktLinked] = useState(false);
  const [jellyfinUsername, setJellyfinUsername] = useState<string | null>(null);
  const [jellyfinForm, setJellyfinForm] = useState({ username: "", password: "" });
  const [jellyfinLoading, setJellyfinLoading] = useState(false);
  const [jellyfinError, setJellyfinError] = useState<string | null>(null);
  const [apiTokens, setApiTokens] = useState<ApiTokenInfo[]>([]);
  const [apiTokensLoading, setApiTokensLoading] = useState(false);
  const [apiTokenName, setApiTokenName] = useState("");
  const [apiTokenCreating, setApiTokenCreating] = useState(false);
  const [newApiToken, setNewApiToken] = useState<string | null>(null);
  const [apiTokenError, setApiTokenError] = useState<string | null>(null);
  const [mfaPromptOpen, setMfaPromptOpen] = useState(false);
  const [mfaPromptCode, setMfaPromptCode] = useState("");
  const [mfaPromptError, setMfaPromptError] = useState<string | null>(null);
  const [pendingPasswordPayload, setPendingPasswordPayload] = useState<any | null>(null);
  const [tokenPasswordPromptOpen, setTokenPasswordPromptOpen] = useState(false);
  const [tokenPasswordValue, setTokenPasswordValue] = useState("");
  const [tokenPasswordError, setTokenPasswordError] = useState<string | null>(null);
  const [tokenPasswordAction, setTokenPasswordAction] = useState<null | ((password: string) => Promise<void>)>(null);
  const showPassword = section === "all" || section === "security";

  const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        window.location.assign("/login");
      }
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      throw new Error("Failed to load profile");
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error("Invalid profile response");
    }
    return res.json() as Promise<ProfileResponse>;
  };

  const loadApiTokens = useCallback(async () => {
    setApiTokensLoading(true);
    setApiTokenError(null);
    try {
      const res = await fetch("/api/profile/api-tokens", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load API tokens");
      }
      const data = await res.json();
      setApiTokens(Array.isArray(data?.tokens) ? data.tokens : []);
    } catch (err: any) {
      setApiTokenError(err?.message ?? "Failed to load API tokens");
    } finally {
      setApiTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showPassword) {
      void loadApiTokens();
    }
  }, [showPassword, loadApiTokens]);

  function requestTokenPassword(action: (password: string) => Promise<void>) {
    setTokenPasswordValue("");
    setTokenPasswordError(null);
    setTokenPasswordAction(() => action);
    setTokenPasswordPromptOpen(true);
  }

  const handleCreateApiToken = async () => {
    const name = apiTokenName.trim();
    if (!name) {
      toast.error("Enter a name for the API token");
      return;
    }
    requestTokenPassword(async (password) => {
      if (!password) throw new Error("Password is required");
      setApiTokenCreating(true);
      setApiTokenError(null);
      setNewApiToken(null);
      try {
        const res = await csrfFetch("/api/profile/api-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, password })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Failed to create API token");
        }
        const data = await res.json();
        if (data?.tokenInfo) {
          setApiTokens(prev => [data.tokenInfo, ...prev]);
        }
        setNewApiToken(data?.token ?? null);
        setApiTokenName("");
        setTokenPasswordPromptOpen(false);
        toast.success("API token created");
      } finally {
        setApiTokenCreating(false);
      }
    });
  };

  const handleRevokeApiToken = async (id: number) => {
    requestTokenPassword(async (password) => {
      if (!password) throw new Error("Password is required");
      setApiTokenError(null);
      const res = await csrfFetch("/api/profile/api-tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to revoke API token");
      }
      setApiTokens(prev => prev.filter(token => token.id !== id));
      setTokenPasswordPromptOpen(false);
      toast.success("API token revoked");
    });
  };

  const { data, error: profileError, isLoading, mutate } = useSWR<ProfileResponse>("/api/v1/profile", fetcher);

  useEffect(() => {
    if (!data?.user) return;
    setInitialData(data.user);
    setForm(prev => ({
      ...prev,
      username: data.user.username,
      displayName: data.user.displayName ?? "",
      email: data.user.email ?? "",
      discordUserId: data.user.discordUserId ?? "",
      letterboxdUsername: data.user.letterboxdUsername ?? "",
      discoverRegion: data.user.discoverRegion ?? null,
      originalLanguage: data.user.originalLanguage ?? null,
      watchlistSyncMovies: data.user.watchlistSyncMovies ?? false,
      watchlistSyncTv: data.user.watchlistSyncTv ?? false,
    }));
    setJellyfinLinked(Boolean(data.user.jellyfinUserId));
    setJellyfinUsername(data.user.jellyfinUsername ?? null);
    setTraktLinked(Boolean(data.user.traktLinked));
  }, [data]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function submitProfile(payload: any): Promise<boolean> {
    setSaving(true);
    try {
      const res = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to update profile");
      }
      const data: UpdateResponse = await res.json();
      setInitialData(data.user);
      setForm(prev => ({
        ...prev,
        username: data.user.username,
        displayName: data.user.displayName ?? "",
        email: data.user.email ?? "",
        discordUserId: form.discordUserId,
        letterboxdUsername: data.user.letterboxdUsername ?? form.letterboxdUsername,
        discoverRegion: data.user.discoverRegion ?? null,
        originalLanguage: data.user.originalLanguage ?? null,
        watchlistSyncMovies: data.user.watchlistSyncMovies ?? false,
        watchlistSyncTv: data.user.watchlistSyncTv ?? false,
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      }));
      mutate();
      setSuccess("Profile updated. Please sign in again to use new details.");
      setRequireLogout(data.requireLogout);
      toast.success("Profile updated");
      return true;
    } catch (err: any) {
      const msg = err?.message ?? "Profile update failed";
      setFormError(msg);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!initialData) return;
    setFormError(null);
    setSuccess(null);
    setRequireLogout(false);

    const payload: any = {};
    const trimmedUsername = form.username.trim().toLowerCase();
    if (trimmedUsername && trimmedUsername !== initialData.username) {
      payload.username = trimmedUsername;
    }
    const displayNameChanged = form.displayName.trim() !== (initialData.displayName ?? "");
    if (displayNameChanged) {
      payload.displayName = form.displayName.trim();
    }

    const emailChanged = form.email.trim() !== (initialData.email ?? "");
    if (emailChanged) {
      payload.email = form.email.trim();
    }

    const discordChanged = form.discordUserId.trim() !== (initialData.discordUserId ?? "");
    if (discordChanged) {
      payload.discordUserId = form.discordUserId.trim();
    }

    const letterboxdChanged = form.letterboxdUsername.trim() !== (initialData.letterboxdUsername ?? "");
    if (letterboxdChanged) {
      payload.letterboxdUsername = form.letterboxdUsername.trim();
    }

    if (form.discoverRegion !== initialData.discoverRegion) {
        payload.discoverRegion = form.discoverRegion;
    }
    if (form.originalLanguage !== initialData.originalLanguage) {
        payload.originalLanguage = form.originalLanguage;
    }
    if (form.watchlistSyncMovies !== initialData.watchlistSyncMovies) {
        payload.watchlistSyncMovies = form.watchlistSyncMovies;
    }
    if (form.watchlistSyncTv !== initialData.watchlistSyncTv) {
        payload.watchlistSyncTv = form.watchlistSyncTv;
    }

    if (form.newPassword || form.confirmPassword) {
      if (form.newPassword !== form.confirmPassword) {
        setFormError("New password and confirmation do not match");
        return;
      }
      if (!form.newPassword) {
        setFormError("Enter a new password");
        return;
      }
      const policy = getPasswordPolicyResult({
        password: form.newPassword,
        username: initialData.username
      });
      if (policy.errors.length) {
        setFormError(policy.errors[0]);
        return;
      }
      payload.newPassword = form.newPassword;
      payload.currentPassword = form.currentPassword;
    }

    if (!Object.keys(payload).length) {
      setFormError("Update a field before saving");
      return;
    }

    if (payload.newPassword) {
      setPendingPasswordPayload(payload);
      setMfaPromptCode("");
      setMfaPromptError(null);
      setMfaPromptOpen(true);
      return;
    }

    await submitProfile(payload);
  }

  const [syncing, setSyncing] = useState(false);
  async function handleSync() {
    setSyncing(true);
    try {
        const res = await csrfFetch("/api/profile/sync-watchlist", { method: "POST" });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error ?? "Sync failed");
        }
        const data = await res.json();
        const count = data.stats?.createdCount ?? 0;
        toast.success(`Sync complete. Created ${count} new request(s).`);
    } catch (err: any) {
        toast.error(err?.message ?? "Failed to sync watchlist");
    } finally {
        setSyncing(false);
    }
  }

  const showGeneral = section === "all" || section === "general";
  const showLinked = section === "all" || section === "linked";
  const watchlistLinked = jellyfinLinked || traktLinked;

  return (
    <div className="space-y-6">
      <Modal
        open={mfaPromptOpen}
        title="Verify with MFA"
        onClose={() => {
          if (saving) return;
          setMfaPromptOpen(false);
          setMfaPromptCode("");
          setMfaPromptError(null);
          setPendingPasswordPayload(null);
        }}
        forceCenter
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-300">Enter your authenticator code to continue with this sensitive change.</p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={mfaPromptCode}
            onChange={(event) => {
              setMfaPromptCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              setMfaPromptError(null);
            }}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm"
            placeholder="123456"
          />
          {mfaPromptError ? <p className="text-xs text-red-300">{mfaPromptError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMfaPromptOpen(false);
                setMfaPromptCode("");
                setMfaPromptError(null);
                setPendingPasswordPayload(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!pendingPasswordPayload) return;
                if (mfaPromptCode.length < 6) {
                  setMfaPromptError("Enter your 6-digit MFA code");
                  return;
                }
                const ok = await submitProfile({ ...pendingPasswordPayload, mfaCode: mfaPromptCode });
                if (ok) {
                  setMfaPromptOpen(false);
                  setMfaPromptCode("");
                  setMfaPromptError(null);
                  setPendingPasswordPayload(null);
                }
              }}
              disabled={saving || mfaPromptCode.length < 6}
            >
              {saving ? "Verifying..." : "Verify & Continue"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={tokenPasswordPromptOpen}
        title="Confirm with password"
        onClose={() => {
          if (apiTokenCreating) return;
          setTokenPasswordPromptOpen(false);
          setTokenPasswordValue("");
          setTokenPasswordError(null);
          setTokenPasswordAction(null);
        }}
        forceCenter
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-300">Enter your current password to continue.</p>
          <input
            type="password"
            autoComplete="current-password"
            value={tokenPasswordValue}
            onChange={(event) => {
              setTokenPasswordValue(event.target.value);
              setTokenPasswordError(null);
            }}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm"
            placeholder="Current password"
          />
          {tokenPasswordError ? <p className="text-xs text-red-300">{tokenPasswordError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTokenPasswordPromptOpen(false);
                setTokenPasswordValue("");
                setTokenPasswordError(null);
                setTokenPasswordAction(null);
              }}
              disabled={apiTokenCreating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!tokenPasswordAction) return;
                try {
                  await tokenPasswordAction(tokenPasswordValue);
                } catch (err: any) {
                  const msg = err?.message ?? "Password validation failed";
                  setTokenPasswordError(msg);
                  setApiTokenError(msg);
                }
              }}
              disabled={apiTokenCreating || !tokenPasswordValue}
            >
              {apiTokenCreating ? "Verifying..." : "Continue"}
            </Button>
          </div>
        </div>
      </Modal>
      {isLoading ? (
        <div className="rounded-2xl md:rounded-3xl glass-strong p-8 md:p-12 flex items-center justify-center border border-white/10 shadow-2xl">
          <Loader2 className="mr-3 h-6 w-6 animate-spin text-foreground/70" />
          <span className="text-lg text-foreground/70">Loading profile...</span>
        </div>
      ) : profileError ? (
        <div className="rounded-2xl md:rounded-3xl glass-strong p-8 md:p-12 border border-red-500/30 bg-red-500/10 text-red-100 shadow-2xl">
          {profileError.message || "Unable to load profile"}
        </div>
      ) : (
        <>
          {/* Basic Info Section */}
          {showGeneral ? (
            <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-2xl">
              <div className="flex items-center gap-3 mb-6 md:mb-8">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-md">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">General Settings</h2>
                  <p className="text-sm text-foreground/60 mt-1">Manage your account preferences</p>
                </div>
              </div>

              {(accountTypeLabel || roleLabel) ? (
                <div className="mb-6 flex flex-wrap gap-2">
                  {accountTypeLabel ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-200">
                      {accountTypeLabel.toLowerCase().includes("jellyfin") && (
                        <Image src="/images/jellyfin.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                      )}
                      {accountTypeLabel}
                    </span>
                  ) : null}
                  {roleLabel ? (
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      roleLabel.toLowerCase() === "owner"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                        : "border-blue-500/30 bg-blue-500/10 text-blue-200"
                    }`}>
                      {roleLabel.toLowerCase() === "owner" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      )}
                      {roleLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <form className="space-y-5 md:space-y-6" onSubmit={handleSubmit}>
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2" htmlFor="profile-display-name">
                        <span>Display Name</span>
                        <span className="text-xs text-foreground/50 font-normal">(optional)</span>
                    </label>
                    <input
                        id="profile-display-name"
                        value={form.displayName}
                        onChange={e => updateField("displayName", e.target.value)}
                        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 md:py-4 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm backdrop-blur-sm"
                        placeholder="Enter your display name"
                    />
                    </div>

                    <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2" htmlFor="profile-username">
                        <span>Username</span>
                        <span className="text-xs text-foreground/50 font-normal">(required)</span>
                    </label>
                    <input
                        id="profile-username"
                        value={form.username}
                        onChange={e => updateField("username", e.target.value)}
                        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 md:py-4 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm backdrop-blur-sm"
                        placeholder="Enter your username"
                    />
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2" htmlFor="profile-email">
                        <span>Email</span>
                        <span className="text-xs text-foreground/50 font-normal">(optional)</span>
                    </label>
                    <input
                        id="profile-email"
                        type="email"
                        value={form.email}
                        onChange={e => updateField("email", e.target.value)}
                        placeholder="your.email@example.com"
                        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 md:py-4 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm backdrop-blur-sm"
                    />
                    </div>
                </div>

                <div className="border-t border-white/10 my-6"></div>
                <h3 className="text-lg font-bold text-foreground mb-4">Discovery Preferences</h3>
                
                <div className="grid md:grid-cols-2 gap-6">
                    <RegionSelector 
                        value={form.discoverRegion} 
                        onChange={(val) => updateField("discoverRegion", val)}
                        label="Discover Region" 
                    />
                    <LanguageSelector 
                        value={form.originalLanguage} 
                        onChange={(val) => updateField("originalLanguage", val)}
                        label="Original Language" 
                    />
                </div>

                <div className="border-t border-white/10 my-6"></div>
                <h3 className="text-lg font-bold text-foreground mb-4">Request Quotas</h3>
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="relative overflow-hidden rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 via-slate-900/40 to-slate-900/20 p-4 hover:border-indigo-500/30 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                        <div className="relative flex items-center gap-3">
                            <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
                                <Film className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-white">Movies</div>
                                <div className="text-xl font-bold text-indigo-400">
                                    {initialData?.requestLimitMovie ? (
                                        <span>{initialData.requestLimitMovie} <span className="text-xs font-normal text-gray-400">per {initialData.requestLimitMovieDays ?? 1} day(s)</span></span>
                                    ) : (
                                        <span className="text-emerald-400">Unlimited</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="relative overflow-hidden rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-950/30 via-slate-900/40 to-slate-900/20 p-4 hover:border-teal-500/30 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none" />
                        <div className="relative flex items-center gap-3">
                            <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg">
                                <Tv className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-white">TV Series</div>
                                <div className="text-xl font-bold text-teal-400">
                                    {initialData?.requestLimitSeries ? (
                                        <span>{initialData.requestLimitSeries} <span className="text-xs font-normal text-gray-400">per {initialData.requestLimitSeriesDays ?? 1} day(s)</span></span>
                                    ) : (
                                        <span className="text-emerald-400">Unlimited</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {watchlistLinked && (
                    <>
                        <div className="border-t border-white/10 my-6"></div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex gap-1">
                                    {jellyfinLinked && (
                                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-md">
                                            <Image src="/images/jellyfin.svg" alt="Jellyfin" width={16} height={16} className="h-4 w-4" />
                                        </div>
                                    )}
                                    {traktLinked && (
                                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md">
                                            <Image src="/images/trakt.svg" alt="Trakt" width={16} height={16} className="h-4 w-4" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">Watchlist Sync</h3>
                                    <p className="text-sm text-foreground/60 mt-0.5">
                                        Auto-request from your {jellyfinLinked && traktLinked ? "Jellyfin & Trakt" : jellyfinLinked ? "Jellyfin" : "Trakt"} watchlists
                                        {!roleLabel?.toLowerCase().includes("admin") && !roleLabel?.toLowerCase().includes("owner") && (
                                            <span className="text-amber-400 block mt-1">Requests will require admin approval unless already available.</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            {(form.watchlistSyncMovies || form.watchlistSyncTv) && (
                                <Button
                                    type="button"
                                    onClick={handleSync}
                                    disabled={syncing}
                                    className="h-9 px-4 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30"
                                >
                                    {syncing ? (
                                        <>
                                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                            Syncing...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                                            Sync Now
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="relative overflow-hidden flex items-center justify-between p-4 rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/20 via-slate-900/30 to-slate-900/10 hover:border-indigo-500/30 transition-all">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                                <div className="relative flex items-center gap-3">
                                    <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md">
                                        <Film className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-white text-sm">Sync Movies</span>
                                        <span className="text-xs text-gray-400">Auto-request from watchlist</span>
                                    </div>
                                </div>
                                <Switch
                                    checked={form.watchlistSyncMovies}
                                    onChange={(val: boolean) => updateField("watchlistSyncMovies", val)}
                                    className={`relative ${
                                        form.watchlistSyncMovies ? 'bg-indigo-600' : 'bg-gray-700'
                                    } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900`}
                                >
                                    <span
                                        className={`${
                                            form.watchlistSyncMovies ? 'translate-x-6' : 'translate-x-1'
                                        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </Switch>
                            </div>

                            <div className="relative overflow-hidden flex items-center justify-between p-4 rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-950/20 via-slate-900/30 to-slate-900/10 hover:border-teal-500/30 transition-all">
                                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none" />
                                <div className="relative flex items-center gap-3">
                                    <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-md">
                                        <Tv className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-white text-sm">Sync Series</span>
                                        <span className="text-xs text-gray-400">Auto-request from watchlist</span>
                                    </div>
                                </div>
                                <Switch
                                    checked={form.watchlistSyncTv}
                                    onChange={(val: boolean) => updateField("watchlistSyncTv", val)}
                                    className={`relative ${
                                        form.watchlistSyncTv ? 'bg-teal-600' : 'bg-gray-700'
                                    } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-gray-900`}
                                >
                                    <span
                                        className={`${
                                            form.watchlistSyncTv ? 'translate-x-6' : 'translate-x-1'
                                        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </Switch>
                            </div>
                        </div>
                    </>
                )}

                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    disabled={saving}
                    variant="secondary"
                    className="px-6 py-3 rounded-xl font-semibold border border-white/10 bg-white/10 text-white hover:bg-white/20 shadow-lg hover:shadow-xl transition-all"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {showLinked ? (
            <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-2xl">
              <div className="flex items-center gap-3 mb-6 md:mb-8">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 backdrop-blur-md">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">Linked Accounts</h2>
                  <p className="text-sm text-foreground/60 mt-1">Connect external services to enhance your experience</p>
                </div>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="relative overflow-hidden rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/20 via-slate-900/30 to-slate-900/10 p-4 hover:border-indigo-500/30 transition-all">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                  <div className="relative space-y-3">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2" htmlFor="profile-discord-id-linked">
                      <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md">
                        <Image src="/images/discord.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                      </div>
                      <span>Discord User ID</span>
                      <span className="text-xs text-foreground/50 font-normal">(optional)</span>
                    </label>
                    <input
                      id="profile-discord-id-linked"
                      value={form.discordUserId}
                      onChange={e => updateField("discordUserId", e.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="18-digit Discord user ID"
                      className="w-full rounded-xl border border-indigo-500/20 bg-indigo-950/20 px-4 py-3 md:py-4 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-sm"
                    />
                    <p className="text-xs text-foreground/50">
                      Used for Discord notifications. <a href="https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Find your ID</a>
                    </p>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/20 via-slate-900/30 to-slate-900/10 p-4 hover:border-emerald-500/30 transition-all">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
                  <div className="relative space-y-3">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2" htmlFor="profile-letterboxd-linked">
                      <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
                        <Image src="/images/letterboxd.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                      </div>
                      <span>Letterboxd Username</span>
                      <span className="text-xs text-foreground/50 font-normal">(optional)</span>
                    </label>
                    <input
                      id="profile-letterboxd-linked"
                      value={form.letterboxdUsername}
                      onChange={e => updateField("letterboxdUsername", e.target.value)}
                      placeholder="your-letterboxd-username"
                      className="w-full rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 md:py-4 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm"
                    />
                    <p className="text-xs text-foreground/50">
                      Connect your Letterboxd profile. <a href="https://letterboxd.com/signup" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Create account</a>
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    disabled={saving}
                    variant="secondary"
                    className="px-6 py-3 rounded-xl font-semibold border border-white/10 bg-white/10 text-white hover:bg-white/20 shadow-lg hover:shadow-xl transition-all"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </form>

              <div className="border-t border-white/10 my-6"></div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Image src="/images/jellyfin.svg" alt="Jellyfin" width={18} height={18} className="h-4.5 w-4.5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Jellyfin Connection</h3>
              </div>

              {jellyfinLinked ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
                    <Image src="/images/jellyfin.svg" alt="" width={20} height={20} className="h-5 w-5" />
                    Linked as <span className="font-semibold">{jellyfinUsername ?? "Jellyfin user"}</span>
                  </div>
                  <button
                    className="btn bg-red-500/10 hover:bg-red-500/20 text-red-200"
                    type="button"
                    onClick={async () => {
                      setJellyfinLoading(true);
                      setJellyfinError(null);
                      try {
                        const res = await csrfFetch("/api/v1/profile/jellyfin", { method: "DELETE" });
                        if (!res.ok) {
                          const body = await res.json().catch(() => ({}));
                          throw new Error(body?.error || "Failed to unlink");
                        }
                        setJellyfinLinked(false);
                        setJellyfinUsername(null);
                        toast.success("Jellyfin account unlinked");
                      } catch (err: any) {
                        setJellyfinError(err?.message ?? "Failed to unlink");
                        toast.error(err?.message ?? "Failed to unlink");
                      } finally {
                        setJellyfinLoading(false);
                      }
                    }}
                    disabled={jellyfinLoading}
                  >
                    {jellyfinLoading ? "Unlinking..." : "Unlink Jellyfin"}
                  </button>
                </div>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={async event => {
                    event.preventDefault();
                    setJellyfinError(null);
                    setJellyfinLoading(true);
                    try {
                      const res = await csrfFetch("/api/v1/profile/jellyfin", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(jellyfinForm)
                      });
                      const body = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        throw new Error(body?.error || "Failed to link");
                      }
                      setJellyfinLinked(true);
                      setJellyfinUsername(jellyfinForm.username);
                      setJellyfinForm({ username: "", password: "" });
                      toast.success("Jellyfin account linked");
                    } catch (err: any) {
                      setJellyfinError(err?.message ?? "Failed to link");
                      toast.error(err?.message ?? "Failed to link");
                    } finally {
                      setJellyfinLoading(false);
                    }
                  }}
                >
                  {jellyfinError ? (
                    <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      {jellyfinError}
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground" htmlFor="jellyfin-username">Jellyfin username</label>
                      <input
                        id="jellyfin-username"
                        value={jellyfinForm.username}
                        onChange={event => setJellyfinForm(prev => ({ ...prev, username: event.target.value }))}
                        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm backdrop-blur-sm"
                        placeholder="Jellyfin username"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground" htmlFor="jellyfin-password">Jellyfin password</label>
                      <input
                        id="jellyfin-password"
                        type="password"
                        value={jellyfinForm.password}
                        onChange={event => setJellyfinForm(prev => ({ ...prev, password: event.target.value }))}
                        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm backdrop-blur-sm"
                        placeholder="Password"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={jellyfinLoading}
                      className="btn-primary px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
                    >
                      {jellyfinLoading ? "Linking..." : "Link Jellyfin"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : null}

          {/* Security Section - Password Management */}
          {showPassword ? (
            <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 ring-1 ring-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Password</h3>
                  <p className="text-sm text-gray-400 mt-1">Update your password to keep your account secure</p>
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80" htmlFor="profile-current-password">
                      Current Password
                    </label>
                    <input
                      id="profile-current-password"
                      type="password"
                      value={form.currentPassword}
                      onChange={e => updateField("currentPassword", e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm"
                      placeholder="Enter your current password"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/80" htmlFor="profile-new-password">
                        New Password
                      </label>
                      <input
                        id="profile-new-password"
                        type="password"
                        value={form.newPassword}
                        onChange={e => updateField("newPassword", e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm"
                        placeholder="New password"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/80" htmlFor="profile-confirm-password">
                        Confirm Password
                      </label>
                      <input
                        id="profile-confirm-password"
                        type="password"
                        value={form.confirmPassword}
                        onChange={e => updateField("confirmPassword", e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm"
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-white/5 border border-white/5 p-4">
                  <PasswordPolicyChecklist
                    password={form.newPassword}
                    username={initialData?.username ?? ""}
                    showReuseNote
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      updateField("currentPassword", "");
                      updateField("newPassword", "");
                      updateField("confirmPassword", "");
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium border-white/10 hover:bg-white/5"
                  >
                    Clear
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving || (!form.currentPassword && !form.newPassword && !form.confirmPassword)}
                    className="px-5 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {showPassword ? (
            <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300">
                    <rect x="2" y="7" width="20" height="10" rx="2" />
                    <path d="M6 7V5a4 4 0 0 1 8 0v2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">API Tokens</h3>
                  <p className="text-sm text-gray-400 mt-1">Create named tokens for apps, CI, or integrations</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={apiTokenName}
                    onChange={e => setApiTokenName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm"
                    placeholder="Token name (e.g. Home Assistant, CI)"
                  />
                  <Button
                    type="button"
                    onClick={handleCreateApiToken}
                    disabled={apiTokenCreating}
                    className="px-5 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                  >
                    {apiTokenCreating ? "Creating..." : "Create Token"}
                  </Button>
                </div>

                {newApiToken ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
                    <div className="text-xs text-emerald-200">Copy this token now. You won&apos;t be able to see it again.</div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <code className="flex-1 rounded-md bg-black/40 px-3 py-2 text-xs text-emerald-100 break-all">{newApiToken}</code>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/20"
                        onClick={() => {
                          void navigator.clipboard?.writeText(newApiToken);
                          toast.success("Token copied");
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                ) : null}

                {apiTokenError ? (
                  <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {apiTokenError}
                  </div>
                ) : null}

                <div className="space-y-2">
                  {apiTokensLoading ? (
                    <div className="text-xs text-white/50">Loading tokens...</div>
                  ) : apiTokens.length ? (
                    apiTokens.map(token => (
                      <div key={token.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{token.name}</div>
                          <div className="text-xs text-white/50">
                            Created {token.createdAt ? formatDate(token.createdAt) : "Unknown"}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-red-500/40 text-red-200 hover:bg-red-500/20"
                          onClick={() => handleRevokeApiToken(token.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-white/50">No API tokens created yet.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Alerts Section - Now handled by ToastProvider globally */}
        </>
      )}
    </div>
  );
}
