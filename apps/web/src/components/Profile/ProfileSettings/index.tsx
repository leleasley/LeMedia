"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf-client";
import { RegionSelector } from "@/components/Common/RegionSelector";
import { LanguageSelector } from "@/components/Common/LanguageSelector";
import { Switch } from "@headlessui/react";

type ProfileResponse = {
  user: {
    username: string;
    email: string | null;
    jellyfinUserId?: string | null;
    jellyfinUsername?: string | null;
    discordUserId?: string | null;
    avatarUrl?: string | null;
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
    email: string | null;
    discordUserId?: string | null;
    discoverRegion?: string | null;
    originalLanguage?: string | null;
    watchlistSyncMovies?: boolean;
    watchlistSyncTv?: boolean;
  };
  requireLogout: boolean;
};

type FormState = {
  username: string;
  email: string;
  discordUserId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  discoverRegion: string | null;
  originalLanguage: string | null;
  watchlistSyncMovies: boolean;
  watchlistSyncTv: boolean;
};

const initialForm: FormState = {
  username: "",
  email: "",
  discordUserId: "",
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
  const [jellyfinUsername, setJellyfinUsername] = useState<string | null>(null);
  const [jellyfinForm, setJellyfinForm] = useState({ username: "", password: "" });
  const [jellyfinLoading, setJellyfinLoading] = useState(false);
  const [jellyfinError, setJellyfinError] = useState<string | null>(null);

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

  const { data, error: profileError, isLoading, mutate } = useSWR<ProfileResponse>("/api/v1/profile", fetcher);

  useEffect(() => {
    if (!data?.user) return;
    setInitialData(data.user);
    setForm(prev => ({
      ...prev,
      username: data.user.username,
      email: data.user.email ?? "",
      discordUserId: data.user.discordUserId ?? "",
      discoverRegion: data.user.discoverRegion ?? null,
      originalLanguage: data.user.originalLanguage ?? null,
      watchlistSyncMovies: data.user.watchlistSyncMovies ?? false,
      watchlistSyncTv: data.user.watchlistSyncTv ?? false,
    }));
    setJellyfinLinked(Boolean(data.user.jellyfinUserId));
    setJellyfinUsername(data.user.jellyfinUsername ?? null);
  }, [data]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
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

    const emailChanged = form.email.trim() !== (initialData.email ?? "");
    if (emailChanged) {
      payload.email = form.email.trim();
    }

    const discordChanged = form.discordUserId.trim() !== (initialData.discordUserId ?? "");
    if (discordChanged) {
      payload.discordUserId = form.discordUserId.trim();
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
      payload.newPassword = form.newPassword;
      payload.currentPassword = form.currentPassword;
    }

    if (!Object.keys(payload).length) {
      setFormError("Update a field before saving");
      return;
    }

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
        email: data.user.email ?? "",
        discordUserId: form.discordUserId,
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
    } catch (err: any) {
      const msg = err?.message ?? "Profile update failed";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
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
  const showPassword = section === "all" || section === "security";

  return (
    <div className="space-y-6">
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
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-foreground">
                      Account Type: {accountTypeLabel}
                    </span>
                  ) : null}
                  {roleLabel ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-foreground">
                      Role: {roleLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <form className="space-y-5 md:space-y-6" onSubmit={handleSubmit}>
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2" htmlFor="profile-username">
                        <span>Display Name</span>
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

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2" htmlFor="profile-discord-id">
                    <span>Discord User ID</span>
                    <span className="text-xs text-foreground/50 font-normal">(optional)</span>
                  </label>
                  <input
                    id="profile-discord-id"
                    value={form.discordUserId}
                    onChange={e => updateField("discordUserId", e.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="18-digit Discord user ID"
                    className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 md:py-4 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm backdrop-blur-sm"
                  />
                  <p className="text-xs text-foreground/50">
                    The multi-digit ID tied to your Discord account. <a href="https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Find your ID</a>
                  </p>
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
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-semibold text-white mb-1">Movies</div>
                        <div className="text-2xl font-bold text-indigo-400">
                            {initialData?.requestLimitMovie ? (
                                <span>{initialData.requestLimitMovie} <span className="text-sm font-normal text-gray-400">per {initialData.requestLimitMovieDays ?? 1} day(s)</span></span>
                            ) : (
                                <span className="text-emerald-400">Unlimited</span>
                            )}
                        </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-semibold text-white mb-1">TV Series</div>
                        <div className="text-2xl font-bold text-purple-400">
                            {initialData?.requestLimitSeries ? (
                                <span>{initialData.requestLimitSeries} <span className="text-sm font-normal text-gray-400">per {initialData.requestLimitSeriesDays ?? 1} day(s)</span></span>
                            ) : (
                                <span className="text-emerald-400">Unlimited</span>
                            )}
                        </div>
                    </div>
                </div>

                {jellyfinLinked && (
                    <>
                        <div className="border-t border-white/10 my-6"></div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-foreground">Watchlist Synchronization</h3>
                                <p className="text-sm text-foreground/60 mt-1">
                                    Automatically request items added to your Jellyfin watchlist.
                                    {!roleLabel?.toLowerCase().includes("admin") && !roleLabel?.toLowerCase().includes("owner") && (
                                        <span className="text-amber-400 block mt-1">Note: Requests will require admin approval unless already available.</span>
                                    )}
                                </p>
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
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                                <path d="M3 3v5h5"></path>
                                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
                                                <path d="M16 16h5v5"></path>
                                            </svg>
                                            Sync Now
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5">
                                <div className="flex flex-col">
                                    <span className="font-semibold text-white text-sm">Sync Movies</span>
                                    <span className="text-xs text-gray-400">Auto-request movies from watchlist</span>
                                </div>
                                <Switch
                                    checked={form.watchlistSyncMovies}
                                    onChange={(val: boolean) => updateField("watchlistSyncMovies", val)}
                                    className={`${
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

                            <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5">
                                <div className="flex flex-col">
                                    <span className="font-semibold text-white text-sm">Sync Series</span>
                                    <span className="text-xs text-gray-400">Auto-request TV shows from watchlist</span>
                                </div>
                                <Switch
                                    checked={form.watchlistSyncTv}
                                    onChange={(val: boolean) => updateField("watchlistSyncTv", val)}
                                    className={`${
                                        form.watchlistSyncTv ? 'bg-indigo-600' : 'bg-gray-700'
                                    } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900`}
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
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">Jellyfin Link</h2>
                  <p className="text-sm text-foreground/60 mt-1">Connect your Jellyfin account to sync your profile</p>
                </div>
              </div>

              {jellyfinLinked ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
                    Linked as <span className="font-semibold">{jellyfinUsername ?? "Jellyfin user"}</span>.
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

                {/* Password Tips */}
                <div className="rounded-lg bg-white/5 border border-white/5 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-white/40">💡</span>
                    <div className="text-xs text-white/50 space-y-1">
                      <p>Use 12+ characters with a mix of letters, numbers, and symbols</p>
                      <p>Don&apos;t reuse passwords from other accounts</p>
                    </div>
                  </div>
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

          {/* Alerts Section - Now handled by ToastProvider globally */}
        </>
      )}
    </div>
  );
}
