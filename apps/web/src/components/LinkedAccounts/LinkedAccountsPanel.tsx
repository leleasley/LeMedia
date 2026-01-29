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
};

type ProfileResponse = {
  user: {
    username: string;
    email: string | null;
    jellyfinUserId?: string | null;
    jellyfinUsername?: string | null;
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
        jellyfinUsername: admin.jellyfinUsername ?? null
      };
    }
    const profile = data as ProfileResponse;
    return {
      jellyfinUserId: profile.user?.jellyfinUserId ?? null,
      jellyfinUsername: profile.user?.jellyfinUsername ?? null
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Linked Accounts</h3>
        <p className="text-sm text-gray-400">View and manage connected external accounts</p>
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6">
        {linked ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Image
                src="/images/jellyfin.svg"
                alt="Jellyfin"
                width={48}
                height={48}
                className="h-12 w-12"
              />
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-white">Jellyfin</h4>
                <p className="text-sm text-gray-400">{normalized.jellyfinUsername || "Connected"}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-medium">
                  Connected
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unlinking ? "Unlinking..." : "Unlink"}
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              <p className="text-white/60">Jellyfin account connected.</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">No linked accounts</p>
            <p className="text-sm text-gray-500 mt-2">
              {mode === "self"
                ? "You have not connected any external accounts yet"
                : "This user has not connected any external accounts"}
            </p>
            {mode === "self" ? (
              <button
                onClick={() => setShowLinkForm(prev => !prev)}
                className="mt-4 inline-flex items-center rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition"
              >
                {showLinkForm ? "Cancel" : "Connect Jellyfin"}
              </button>
            ) : null}
          </div>
        )}

        {mode === "self" && !linked && showLinkForm ? (
          <form className="mt-6 space-y-4" onSubmit={handleLink}>
            {linkError ? (
              <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {linkError}
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground" htmlFor="jellyfin-username">
                  Jellyfin username
                </label>
                <input
                  id="jellyfin-username"
                  value={linkForm.username}
                  onChange={event => setLinkForm(prev => ({ ...prev, username: event.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm backdrop-blur-sm"
                  placeholder="Jellyfin username"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground" htmlFor="jellyfin-password">
                  Jellyfin password
                </label>
                <input
                  id="jellyfin-password"
                  type="password"
                  value={linkForm.password}
                  onChange={event => setLinkForm(prev => ({ ...prev, password: event.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-foreground placeholder:text-foreground/30 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm backdrop-blur-sm"
                  placeholder="Password"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={linking}
                className="btn-primary px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                {linking ? "Linking..." : "Link Jellyfin"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
