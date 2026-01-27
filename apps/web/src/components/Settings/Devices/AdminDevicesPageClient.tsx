"use client";

import useSWR from "swr";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

type SessionRow = {
  userId: number;
  username: string;
  jti: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
};

type SessionsResponse = {
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

export function AdminDevicesPageClient() {
  const { data, error, isValidating, mutate } = useSWR<SessionsResponse>("/api/v1/admin/devices", fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true
  });
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();

  const sessions = data?.sessions ?? [];

  const activeCount = sessions.filter(session => !session.revokedAt).length;
  const revokedCount = sessions.length - activeCount;

  const deleteRevokedSession = async (jti: string) => {
    setDeleting(jti);
    try {
      const res = await csrfFetch("/api/v1/admin/devices", {
        method: "DELETE",
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

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Devices</h1>
            <p className="text-sm text-white/60 mt-1">
              Review active and recent sessions across all users.
            </p>
          </div>
          <div className="text-xs text-white/60">
            {isValidating ? "Refreshing..." : `${sessions.length} sessions`}
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">Active</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-300">{activeCount}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">Revoked</div>
            <div className="mt-1 text-2xl font-semibold text-rose-300">{revokedCount}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">Total</div>
            <div className="mt-1 text-2xl font-semibold text-white">{sessions.length}</div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load sessions.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/70 shadow-lg shadow-black/10">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wider text-gray-300">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Last Seen</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                  No sessions found.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={`${session.userId}-${session.jti}`} className="hover:bg-gray-800/60">
                  <td className="px-4 py-3 text-gray-200">{session.username}</td>
                  <td className="px-4 py-3 text-gray-200">
                    {session.deviceLabel || "Unknown device"}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{formatWhen(session.lastSeenAt)}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {session.revokedAt ? formatWhen(session.revokedAt) : formatWhen(session.expiresAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{session.ipAddress ?? "—"}</td>
                  <td className="px-4 py-3">
                    {session.revokedAt ? (
                      <span className="rounded-full bg-red-500/20 px-2 py-1 text-[10px] font-semibold text-red-200">
                        Revoked
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-200">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {session.revokedAt ? (
                      <button
                        onClick={() => deleteRevokedSession(session.jti)}
                        disabled={deleting === session.jti}
                        className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                      >
                        {deleting === session.jti ? "Deleting..." : "Delete"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
