"use client";

import { useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";

type ProfileResponse = {
  user: {
    watchlistSyncMovies?: boolean;
    watchlistSyncTv?: boolean;
  };
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Failed to load profile");
  return body;
};

export function WatchlistSyncButton() {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const { data, error } = useSWR<ProfileResponse>("/api/profile", fetcher);

  const enabled =
    Boolean(data?.user?.watchlistSyncMovies) ||
    Boolean(data?.user?.watchlistSyncTv);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await csrfFetch("/api/profile/sync-watchlist", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to sync watchlist");
      }
      const added = body?.stats?.added ?? 0;
      const skipped = body?.stats?.skipped ?? 0;
      const failures = body?.stats?.failed ?? 0;
      toast.success(`Sync complete. Added ${added}, skipped ${skipped}, failed ${failures}.`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to sync watchlist");
    } finally {
      setSyncing(false);
    }
  };

  const disabled = syncing || !enabled;
  const helper = error
    ? "Unable to load sync status"
    : enabled
      ? "Manually sync your Trakt/Jellyfin watchlist"
      : "Enable watchlist sync in Profile Settings first";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div>
        <div className="text-sm font-semibold text-white">Sync Watchlist</div>
        <div className="text-xs text-gray-400">{helper}</div>
      </div>
      <button
        onClick={handleSync}
        disabled={disabled}
        className="btn"
      >
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
    </div>
  );
}
