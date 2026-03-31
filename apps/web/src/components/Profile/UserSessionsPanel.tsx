"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { publishLiveSync, subscribeLiveSync } from "@/lib/live-sync";

type SessionRow = {
  jti: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent?: string | null;
  deviceLabel?: string | null;
  ipAddress?: string | null;
  deviceId?: string | null;
  deviceNickname?: string | null;
  trustedAt?: string | null;
  deviceFirstSeenAt?: string | null;
  deviceLastSeenAt?: string | null;
  suspiciousNetwork?: boolean;
};

type SessionsResponse = {
  currentJti: string | null;
  sessions: SessionRow[];
};

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => res.json());

function formatWhen(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function UserSessionsPanel() {
  const { data, error, mutate, isValidating } = useSWR<SessionsResponse>("/api/profile/sessions", fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
    revalidateIfStale: true,
    refreshWhenHidden: false,
  });
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceNickname, setDeviceNickname] = useState("");
  const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => subscribeLiveSync("sessions", () => { void mutate(); }), [mutate]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void mutate();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [mutate]);

  const revokeSession = async (jti: string) => {
    setRevoking(jti);
    try {
      const res = await csrfFetch("/api/profile/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jti })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to revoke session");
      }
      toast.success("Session revoked");
      publishLiveSync("sessions", { action: "revoke", jti });
      await mutate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  };

  const revokeOtherSessions = async () => {
    setRevokingAll(true);
    try {
      const res = await csrfFetch("/api/profile/sessions/revoke-all", { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to revoke sessions");
      }
      toast.success("Signed out of other sessions");
      publishLiveSync("sessions", { action: "revoke-others" });
      await mutate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke sessions");
    } finally {
      setRevokingAll(false);
    }
  };

  const deleteRevokedSession = async (jti: string) => {
    setDeleting(jti);
    try {
      const res = await csrfFetch("/api/profile/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jti })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to delete session");
      }
      toast.success("Session deleted");
      publishLiveSync("sessions", { action: "delete", jti });
      mutate(
        (current) => ({
          currentJti: current?.currentJti ?? null,
          sessions: (current?.sessions ?? []).filter((session) => session.jti !== jti)
        }),
        false
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete session");
    } finally {
      setDeleting(null);
    }
  };

  const saveDevice = async (deviceId: string, trusted?: boolean) => {
    setSavingDeviceId(deviceId);
    try {
      const res = await csrfFetch("/api/profile/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          nickname: editingDeviceId === deviceId ? (deviceNickname.trim() || null) : undefined,
          trusted,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update device");
      }
      toast.success("Device updated");
      publishLiveSync("sessions", { action: "device-update", deviceId });
      setEditingDeviceId(null);
      setDeviceNickname("");
      await mutate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update device");
    } finally {
      setSavingDeviceId(null);
    }
  };

  if (!data && !error) {
    return (
      <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-xl">
        <div className="text-sm text-muted">Loading sessions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-xl">
        <div className="text-sm text-red-300">Failed to load sessions.</div>
      </div>
    );
  }

  const sessions = data?.sessions ?? [];
  const currentJti = data?.currentJti ?? null;
  const currentSession = sessions.find(s => s.jti === currentJti);
  const currentDeviceId = currentSession?.deviceId ?? null;

  return (
    <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Active Sessions</h2>
          <p className="text-sm text-gray-400 mt-1">
            View where your account is signed in and revoke access.
          </p>
        </div>
        <button
          type="button"
          onClick={revokeOtherSessions}
          disabled={revokingAll || !currentJti || sessions.length <= 1}
          className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
        >
          {revokingAll ? "Signing out..." : "Sign out other sessions"}
        </button>
      </div>

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
            No active sessions found.
          </div>
        ) : (
          sessions.map((session) => {
            const isCurrent = currentJti && session.jti === currentJti;
            return (
              <div key={session.jti} className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="space-y-1 text-sm text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {isCurrent
                          ? "This device"
                          : currentDeviceId && session.deviceId && session.deviceId === currentDeviceId
                            ? "This device"
                            : "Other device"}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                          current
                        </span>
                      )}
                      {!isCurrent && currentDeviceId && session.deviceId && session.deviceId === currentDeviceId && (
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-200">
                          same device
                        </span>
                      )}
                      {session.revokedAt && (
                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-200">
                          revoked
                        </span>
                      )}
                    </div>
                    <div className="text-white/90">
                      {session.deviceNickname?.trim() || session.deviceLabel || "Unknown device"}
                    </div>
                    {session.deviceNickname ? (
                      <div className="text-xs text-gray-400">Hardware: {session.deviceLabel || "Unknown device"}</div>
                    ) : null}
                    <div>Last seen: {formatWhen(session.lastSeenAt)}</div>
                    {session.deviceFirstSeenAt ? <div>First seen: {formatWhen(session.deviceFirstSeenAt)}</div> : null}
                    {session.revokedAt ? (
                      <div>Revoked: {formatWhen(session.revokedAt)}</div>
                    ) : (
                      <div>Expires: {formatWhen(session.expiresAt)}</div>
                    )}
                    {session.ipAddress ? <div>IP: {session.ipAddress}</div> : null}
                    {session.trustedAt ? <div>Trusted since: {formatWhen(session.trustedAt)}</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {session.trustedAt && (
                      <span className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200">
                        trusted
                      </span>
                    )}
                    {session.suspiciousNetwork && (
                      <span className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200">
                        new network
                      </span>
                    )}
                    {session.deviceId && !session.revokedAt && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDeviceId(session.deviceId ?? null);
                          setDeviceNickname(session.deviceNickname ?? "");
                        }}
                        disabled={savingDeviceId === session.deviceId}
                        className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                      >
                        Rename
                      </button>
                    )}
                    {session.deviceId && !session.revokedAt && (
                      <button
                        type="button"
                        onClick={() => saveDevice(session.deviceId!, !session.trustedAt)}
                        disabled={savingDeviceId === session.deviceId}
                        className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                      >
                        {savingDeviceId === session.deviceId ? "Saving..." : session.trustedAt ? "Untrust" : "Trust"}
                      </button>
                    )}
                    {!isCurrent && !session.revokedAt && (
                      <button
                        type="button"
                        onClick={() => revokeSession(session.jti)}
                        disabled={revoking === session.jti}
                        className="rounded-lg bg-red-500/20 hover:bg-red-500/30 px-4 py-2 text-sm font-semibold text-red-200 transition-colors disabled:opacity-50"
                      >
                        {revoking === session.jti ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                    {session.revokedAt && (
                      <button
                        type="button"
                        onClick={() => deleteRevokedSession(session.jti)}
                        disabled={deleting === session.jti}
                        className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                      >
                        {deleting === session.jti ? "Deleting..." : "Delete"}
                      </button>
                    )}
                    {isValidating ? (
                      <span className="text-xs text-gray-500">Refreshing...</span>
                    ) : null}
                  </div>
                </div>
                {editingDeviceId && session.deviceId === editingDeviceId && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Device nickname
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={deviceNickname}
                      onChange={(event) => setDeviceNickname(event.target.value)}
                      placeholder="Living room iPad"
                      maxLength={80}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => saveDevice(session.deviceId!)}
                      disabled={savingDeviceId === session.deviceId}
                      className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    >
                      Save name
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDeviceId(null);
                        setDeviceNickname("");
                      }}
                      className="rounded-lg bg-transparent px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
