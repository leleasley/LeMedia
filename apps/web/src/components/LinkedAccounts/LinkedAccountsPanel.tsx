"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";

type LinkedAccountsMode = "self" | "admin";

type AdminUser = {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  jellyfinUserId: string | null;
  jellyfinUsername: string | null;
  discordUserId?: string | null;
  letterboxdUsername?: string | null;
  imdbUserId?: string | null;
  traktUsername?: string | null;
};

type ProfileResponse = {
  user: {
    username: string;
    email: string | null;
    jellyfinUserId?: string | null;
    jellyfinUsername?: string | null;
    discordUserId?: string | null;
    letterboxdUsername?: string | null;
    imdbUserId?: string | null;
    traktUsername?: string | null;
    traktLinked?: boolean;
    traktTokenExpiresAt?: string | null;
  };
};

export function LinkedAccountsPanel({
  mode,
  userId
}: {
  mode: LinkedAccountsMode;
  userId?: string | number;
}) {
  const toast = useToast();
  const [unlinking, setUnlinking] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState({ username: "", password: "" });
  
  // Discord state
  const [editingDiscord, setEditingDiscord] = useState(false);
  const [discordInput, setDiscordInput] = useState("");
  const [discordValidating, setDiscordValidating] = useState(false);
  const [discordError, setDiscordError] = useState<string | null>(null);
  
  // Letterboxd state
  const [editingLetterboxd, setEditingLetterboxd] = useState(false);
  const [letterboxdInput, setLetterboxdInput] = useState("");
  const [letterboxdValidating, setLetterboxdValidating] = useState(false);
  const [letterboxdError, setLetterboxdError] = useState<string | null>(null);
  
  // Trakt state
  const [editingTrakt, setEditingTrakt] = useState(false);
  const [traktInput, setTraktInput] = useState("");
  const [traktValidating, setTraktValidating] = useState(false);
  const [traktError, setTraktError] = useState<string | null>(null);
  
  const [discordDeleting, setDiscordDeleting] = useState(false);
  const [letterboxdDeleting, setLetterboxdDeleting] = useState(false);
  const [traktDeleting, setTraktDeleting] = useState(false);
  const [traktConnecting, setTraktConnecting] = useState(false);
  const [letterboxdImporting, setLetterboxdImporting] = useState(false);

  const adminUrl = userId ? `/api/v1/admin/users/${userId}` : null;
  const profileUrl = "/api/v1/profile";
  const swrKey = mode === "admin" ? adminUrl : profileUrl;

  const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "Failed to load linked accounts");
    return body;
  };

  const { data, error, mutate, isLoading } = useSWR<AdminUser | ProfileResponse>(swrKey, fetcher);
  const normalized = useMemo(() => {
    if (!data) return null;
    if (mode === "admin") {
      const admin = data as AdminUser;
      return {
        jellyfinUserId: admin.jellyfinUserId ?? null,
        jellyfinUsername: admin.jellyfinUsername ?? null,
        discordUserId: admin.discordUserId ?? null,
        letterboxdUsername: admin.letterboxdUsername ?? null,
        traktUsername: admin.traktUsername ?? null,
        traktLinked: false,
        traktTokenExpiresAt: null
      };
    }
    const profile = data as ProfileResponse;
    return {
      jellyfinUserId: profile.user?.jellyfinUserId ?? null,
      jellyfinUsername: profile.user?.jellyfinUsername ?? null,
      discordUserId: profile.user?.discordUserId ?? null,
      letterboxdUsername: profile.user?.letterboxdUsername ?? null,
      traktUsername: profile.user?.traktUsername ?? null,
      traktLinked: profile.user?.traktLinked ?? false,
      traktTokenExpiresAt: profile.user?.traktTokenExpiresAt ?? null
    };
  }, [data, mode]);

  const handleUnlink = async () => {
    if (!normalized?.jellyfinUserId) return;
    if (!confirm("Are you sure you want to unlink this Jellyfin account?")) return;

    setUnlinking(true);
    try {
      const res = await csrfFetch(
        mode === "admin"
          ? `/api/v1/admin/users/${userId}/unlink-jellyfin`
          : "/api/v1/profile/jellyfin",
        { method: mode === "admin" ? "POST" : "DELETE" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to unlink account");
      }
      toast.success("Jellyfin account unlinked successfully");
      setShowLinkForm(false);
      mutate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unlink account");
    } finally {
      setUnlinking(false);
    }
  };

  const handleLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode !== "self") return;
    setLinkError(null);
    setLinking(true);
    try {
      const res = await csrfFetch("/api/v1/profile/jellyfin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkForm)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to link account");
      }
      toast.success("Jellyfin account linked");
      setLinkForm({ username: "", password: "" });
      setShowLinkForm(false);
      mutate();
    } catch (err: any) {
      setLinkError(err?.message ?? "Failed to link account");
      toast.error(err?.message ?? "Failed to link account");
    } finally {
      setLinking(false);
    }
  };

  const handleSaveDiscord = async () => {
    setDiscordError(null);
    setDiscordValidating(true);
    try {
      // Validate Discord ID format first
      const res = await csrfFetch("/api/v1/profile/validate-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordUserId: discordInput })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Invalid Discord ID");
      }

      // Save to profile
      const updateRes = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordUserId: discordInput.trim() })
      });
      const updateBody = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) {
        throw new Error(updateBody?.error || "Failed to save Discord ID");
      }

      toast.success("Discord ID saved successfully");
      setEditingDiscord(false);
      mutate();
    } catch (err: any) {
      setDiscordError(err?.message ?? "Failed to save Discord ID");
      toast.error(err?.message ?? "Failed to save Discord ID");
    } finally {
      setDiscordValidating(false);
    }
  };

  const handleSaveLetterboxd = async () => {
    setLetterboxdError(null);
    setLetterboxdValidating(true);
    try {
      // Validate Letterboxd username
      const res = await csrfFetch("/api/v1/profile/validate-letterboxd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterboxdUsername: letterboxdInput })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Invalid Letterboxd username");
      }

      // Save to profile
      const updateRes = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterboxdUsername: letterboxdInput.trim() })
      });
      const updateBody = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) {
        throw new Error(updateBody?.error || "Failed to save Letterboxd username");
      }

      toast.success("Letterboxd username saved successfully");
      setEditingLetterboxd(false);
      mutate();
    } catch (err: any) {
      setLetterboxdError(err?.message ?? "Failed to save Letterboxd username");
      toast.error(err?.message ?? "Failed to save Letterboxd username");
    } finally {
      setLetterboxdValidating(false);
    }
  };

  const handleDeleteDiscord = async () => {
    if (!confirm("Are you sure you want to unlink your Discord account?")) return;
    
    setDiscordDeleting(true);
    try {
      const endpoint = mode === "admin" 
        ? `/api/v1/admin/users/${userId}`
        : "/api/v1/profile";
      
      const res = await csrfFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordUserId: null })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to unlink Discord");
      }

      toast.success("Discord account unlinked successfully");
      setEditingDiscord(false);
      mutate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unlink Discord");
    } finally {
      setDiscordDeleting(false);
    }
  };

  const handleDeleteLetterboxd = async () => {
    if (!confirm("Are you sure you want to unlink your Letterboxd account?")) return;
    
    setLetterboxdDeleting(true);
    try {
      const endpoint = mode === "admin" 
        ? `/api/v1/admin/users/${userId}`
        : "/api/v1/profile";
      
      const res = await csrfFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterboxdUsername: null })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to unlink Letterboxd");
      }

      toast.success("Letterboxd account unlinked successfully");
      setEditingLetterboxd(false);
      mutate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unlink Letterboxd");
    } finally {
      setLetterboxdDeleting(false);
    }
  };

  const handleSaveTrakt = async () => {
    setTraktError(null);
    setTraktValidating(true);
    try {
      // Validate Trakt username
      const res = await csrfFetch("/api/v1/profile/validate-trakt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traktUsername: traktInput })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Invalid Trakt username");
      }

      // Save to profile
      const updateRes = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traktUsername: traktInput.trim() })
      });
      const updateBody = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) {
        throw new Error(updateBody?.error || "Failed to save Trakt username");
      }

      toast.success("Trakt username saved successfully");
      setEditingTrakt(false);
      mutate();
    } catch (err: any) {
      setTraktError(err?.message ?? "Failed to save Trakt username");
      toast.error(err?.message ?? "Failed to save Trakt username");
    } finally {
      setTraktValidating(false);
    }
  };

  const handleConnectTrakt = () => {
    if (typeof window === "undefined") return;
    setTraktConnecting(true);
    const returnTo = window.location.pathname + window.location.search;
    window.location.assign(`/api/v1/profile/trakt/connect?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const handleDeleteTrakt = async () => {
    if (!confirm("Are you sure you want to unlink your Trakt account?")) return;
    
    setTraktDeleting(true);
    try {
      let res: Response;
      if (mode === "self") {
        res = await csrfFetch("/api/v1/profile/trakt/disconnect", { method: "POST" });
      } else {
        const endpoint = `/api/v1/admin/users/${userId}`;
        res = await csrfFetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traktUsername: null })
        });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to unlink Trakt");
      }

      toast.success("Trakt account unlinked successfully");
      setEditingTrakt(false);
      mutate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unlink Trakt");
    } finally {
      setTraktDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Failed to load linked accounts
      </div>
    );
  }

  if (isLoading || !normalized) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  const linked = Boolean(normalized.jellyfinUserId);
  const hasDiscord = Boolean(normalized.discordUserId);
  const hasLetterboxd = Boolean(normalized.letterboxdUsername);
  const hasTrakt = Boolean(normalized.traktUsername);
  const hasTraktOauth = Boolean(normalized.traktLinked);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Linked Accounts</h3>
        <p className="text-sm text-gray-400">View and manage connected external accounts</p>
        <div className="mt-3 p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-gray-300 leading-relaxed">
            <span className="font-semibold text-white">Why link your accounts?</span> Connect your Discord, Letterboxd, Trakt, and Jellyfin accounts to unlock the full LeMedia experience. Discord notifications keep you updated on new content and community activity. Letterboxd and Trakt integration lets you track your movie and show ratings with detailed stats and recommendations. Jellyfin connection enables seamless media library management and synchronized viewing across all your devices.
          </p>
        </div>
      </div>

      {/* Discord Account */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-900/40 p-6 backdrop-blur-md hover:border-indigo-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          {editingDiscord ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <Image
                    src="/images/discord.svg"
                    alt="Discord"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                  />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Discord</h4>
                  <p className="text-xs text-indigo-300">Link your Discord profile for notifications & community features</p>
                </div>
              </div>
              {discordError && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {discordError}
                </div>
              )}
              <input
                type="text"
                value={discordInput}
                onChange={e => setDiscordInput(e.target.value)}
                placeholder="Enter your Discord user ID (17-19 digits)"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
              />
              <p className="text-xs text-gray-400">
                Find your Discord ID at <a href="https://support.discord.com/hc/en-us/articles/206346498" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">Discord Help Center</a>
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setEditingDiscord(false);
                    setDiscordError(null);
                    setDiscordInput("");
                  }}
                  className="px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDiscord}
                  disabled={discordValidating || !discordInput.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {discordValidating ? "Verifying..." : "Verify & Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <Image
                    src="/images/discord.svg"
                    alt="Discord"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                  />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-white">Discord</h4>
                  <p className="text-sm text-gray-300">
                    {hasDiscord ? `ID: ${normalized.discordUserId}` : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasDiscord && (
                  <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30">
                    Connected
                  </div>
                )}
                {(mode === "self" || mode === "admin") && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingDiscord(true);
                        setDiscordInput(normalized.discordUserId ?? "");
                      }}
                      className="px-4 py-2 rounded-lg bg-indigo-600/80 text-white hover:bg-indigo-600 transition text-sm font-medium"
                    >
                      {hasDiscord ? "Edit" : "Add"}
                    </button>
                    {hasDiscord && (
                      <button
                        onClick={handleDeleteDiscord}
                        disabled={discordDeleting}
                        className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {discordDeleting ? "Removing..." : "Unlink"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Letterboxd Account */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-slate-900/40 p-6 backdrop-blur-md hover:border-emerald-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          {editingLetterboxd ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
                  <Image
                    src="/images/letterboxd.svg"
                    alt="Letterboxd"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                  />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Letterboxd</h4>
                  <p className="text-xs text-emerald-300">Link your profile to sync movies & track viewing history</p>
                </div>
              </div>
              {letterboxdError && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {letterboxdError}
                </div>
              )}
              <input
                type="text"
                value={letterboxdInput}
                onChange={e => setLetterboxdInput(e.target.value)}
                placeholder="Enter your Letterboxd username"
                className="w-full rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm"
              />
              <p className="text-xs text-gray-400">
                Create an account at <a href="https://letterboxd.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 underline">Letterboxd.com</a>
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setEditingLetterboxd(false);
                    setLetterboxdError(null);
                    setLetterboxdInput("");
                  }}
                  className="px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLetterboxd}
                  disabled={letterboxdValidating || !letterboxdInput.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {letterboxdValidating ? "Verifying..." : "Verify & Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
                  <Image
                    src="/images/letterboxd.svg"
                    alt="Letterboxd"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                  />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-white">Letterboxd</h4>
                  <p className="text-sm text-gray-300">
                    {hasLetterboxd ? `@${normalized.letterboxdUsername}` : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasLetterboxd && (
                  <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30">
                    Connected
                  </div>
                )}
                {(mode === "self" || mode === "admin") && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingLetterboxd(true);
                        setLetterboxdInput(normalized.letterboxdUsername ?? "");
                      }}
                      className="px-4 py-2 rounded-lg bg-emerald-600/80 text-white hover:bg-emerald-600 transition text-sm font-medium"
                    >
                      {hasLetterboxd ? "Edit" : "Add"}
                    </button>
                    {hasLetterboxd && (
                      <button
                        onClick={handleDeleteLetterboxd}
                        disabled={letterboxdDeleting}
                        className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {letterboxdDeleting ? "Removing..." : "Unlink"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trakt Account */}
      <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/40 via-slate-900/60 to-slate-900/40 p-6 backdrop-blur-md hover:border-red-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          {editingTrakt ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
                  <Image
                    src="/images/trakt.svg"
                    alt="Trakt"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                  />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Trakt</h4>
                  <p className="text-xs text-red-300">Link your profile to track shows & movies</p>
                </div>
              </div>
              {traktError && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {traktError}
                </div>
              )}
              <input
                type="text"
                value={traktInput}
                onChange={e => setTraktInput(e.target.value)}
                placeholder="Enter your Trakt username"
                className="w-full rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-sm"
              />
              <p className="text-xs text-gray-400">
                Visit <a href="https://trakt.tv" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 underline">Trakt.tv</a> to create an account
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setEditingTrakt(false);
                    setTraktError(null);
                    setTraktInput("");
                  }}
                  className="px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTrakt}
                  disabled={traktValidating || !traktInput.trim()}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {traktValidating ? "Verifying..." : "Verify & Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
                  <Image
                    src="/images/trakt.svg"
                    alt="Trakt"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                  />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-white">Trakt</h4>
                  <p className="text-sm text-gray-300">
                    {normalized?.traktUsername ? `@${normalized.traktUsername}` : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(hasTrakt || hasTraktOauth) && (
                  <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30">
                    {hasTraktOauth ? "Connected" : "Username only"}
                  </div>
                )}
                {(mode === "self" || mode === "admin") && (
                  <div className="flex gap-2">
                    {mode === "self" ? (
                      <>
                        <button
                          onClick={handleConnectTrakt}
                          className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={traktConnecting}
                        >
                          {traktConnecting ? "Redirecting..." : (hasTraktOauth ? "Reconnect" : "Connect")}
                        </button>
                        {(hasTrakt || hasTraktOauth) && (
                          <button
                            onClick={handleDeleteTrakt}
                            disabled={traktDeleting}
                            className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {traktDeleting ? "Removing..." : "Unlink"}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingTrakt(true);
                            setTraktInput(normalized?.traktUsername ?? "");
                          }}
                          className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-sm font-medium"
                        >
                          {normalized?.traktUsername ? "Edit" : "Add"}
                        </button>
                        {normalized?.traktUsername && (
                          <button
                            onClick={handleDeleteTrakt}
                            disabled={traktDeleting}
                            className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {traktDeleting ? "Removing..." : "Unlink"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Jellyfin Account */}
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-900/40 p-6 backdrop-blur-md hover:border-purple-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          {linked ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Image
                    src="/images/jellyfin.svg"
                    alt="Jellyfin"
                    width={32}
                    height={32}
                    className="h-8 w-8"
                  />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-white">Jellyfin</h4>
                  <p className="text-sm text-gray-300">{normalized.jellyfinUsername || "Connected"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30">
                  Connected
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unlinking ? "Unlinking..." : "Unlink"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-300 font-medium mb-2">Jellyfin not connected</p>
              <p className="text-sm text-gray-400 mb-4">
                {mode === "self"
                  ? "Connect your Jellyfin account to enable synchronized watchlists and recommendations"
                  : "This user has not connected a Jellyfin account"}
              </p>
              {mode === "self" ? (
                <button
                  onClick={() => setShowLinkForm(prev => !prev)}
                  className="inline-flex items-center rounded-lg bg-purple-600/80 text-white px-4 py-2 text-sm font-medium hover:bg-purple-600 transition"
                >
                  {showLinkForm ? "Cancel" : "Connect Jellyfin"}
                </button>
              ) : null}
            </div>
          )}

          {mode === "self" && !linked && showLinkForm ? (
            <form className="mt-6 space-y-4" onSubmit={handleLink}>
              {linkError ? (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {linkError}
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white" htmlFor="jellyfin-username">
                    Jellyfin username
                  </label>
                  <input
                    id="jellyfin-username"
                    value={linkForm.username}
                    onChange={event => setLinkForm(prev => ({ ...prev, username: event.target.value }))}
                    className="w-full rounded-xl border border-purple-500/30 bg-purple-950/20 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-sm"
                    placeholder="Jellyfin username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white" htmlFor="jellyfin-password">
                    Jellyfin password
                  </label>
                  <input
                    id="jellyfin-password"
                    type="password"
                    value={linkForm.password}
                    onChange={event => setLinkForm(prev => ({ ...prev, password: event.target.value }))}
                    className="w-full rounded-xl border border-purple-500/30 bg-purple-950/20 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-sm"
                    placeholder="Password"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLinkForm(false)}
                  className="px-6 py-3 rounded-xl border border-white/20 text-white hover:bg-white/10 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linking}
                  className="px-6 py-3 rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {linking ? "Linking..." : "Link Jellyfin"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
