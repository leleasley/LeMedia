"use client";

import useSWR from "swr";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

type SessionRow = {
  jti: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent?: string | null;
  deviceLabel?: string | null;
  ipAddress?: string | null;
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
  const { data, error, mutate, isValidating } = useSWR<SessionsResponse>("/api/profile/sessions", fetcher);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();

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
              <div
                key={session.jti}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/30 p-4"
              >
                <div className="space-y-1 text-sm text-gray-300">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {isCurrent ? "This device" : "Other session"}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                        current
                      </span>
                    )}
                    {session.revokedAt && (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-200">
                        revoked
                      </span>
                    )}
                  </div>
                  <div className="text-white/90">
                    {session.deviceLabel || "Unknown device"}
                  </div>
                  <div>Last seen: {formatWhen(session.lastSeenAt)}</div>
                  {session.revokedAt ? (
                    <div>Revoked: {formatWhen(session.revokedAt)}</div>
                  ) : (
                    <div>Expires: {formatWhen(session.expiresAt)}</div>
                  )}
                  {session.ipAddress ? <div>IP: {session.ipAddress}</div> : null}
                </div>
                <div className="flex items-center gap-2">
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
            );
          })
        )}
      </div>
    </div>
  );
}
