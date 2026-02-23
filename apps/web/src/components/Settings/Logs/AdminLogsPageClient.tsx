"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { ConfirmationModal } from "@/components/Common/ConfirmationModal";
import { logger } from "@/lib/logger";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AuditRow = {
  id: number;
  action: string;
  actor: string;
  target: string | null;
  metadata: unknown;
  ip: string | null;
  created_at: string;
};

type LogsResponse = {
  results: AuditRow[];
  pageInfo: {
    page: number;
    pages: number;
    results: number;
    total: number;
    limit: number;
  };
};

type NotificationChannelSummary = {
  channel: string;
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  retryCount: number;
  successRate: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

type NotificationFailure = {
  id: number;
  endpointId: number;
  endpointName: string;
  channel: string;
  eventType: string;
  attemptNumber: number;
  errorMessage: string | null;
  createdAt: string;
};

type NotificationReliabilityResponse = {
  overview: {
    generatedAt: string;
    windowDays: number;
    channels: NotificationChannelSummary[];
    recentFailures: NotificationFailure[];
  };
  users: Array<{ id: number; username: string; displayName: string | null }>;
};

const ACTION_LABELS: Record<string, string> = {
  "user.login": "Logged in",
  "user.logout": "Logged out",
  "admin.settings_changed": "Settings updated",
  "notification_endpoint.created": "Notification endpoint created",
  "notification_endpoint.updated": "Notification endpoint updated",
  "notification_endpoint.deleted": "Notification endpoint deleted",
  "media_share.created": "Share link created",
  "media_share.revoked": "Share link revoked",
  "notification_reliability.test_user": "Reliability test sent",
};

function formatActionLabel(action: string) {
  const direct = ACTION_LABELS[action];
  if (direct) return direct;
  const cleaned = action.replace(/[_\.]+/g, " ").trim();
  if (!cleaned) return "Activity";
  return cleaned
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(" ");
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Date(value).toISOString().replace("T", " ").replace("Z", " UTC");
  } catch {
    return String(value);
  }
}

function channelTitle(channel: string) {
  return channel ? channel[0].toUpperCase() + channel.slice(1) : "Unknown";
}

export function AdminLogsPageClient({
  initialData,
  initialPage,
  initialReliability,
  adminUsers,
}: {
  initialData: LogsResponse;
  initialPage: number;
  initialReliability: NotificationReliabilityResponse["overview"];
  adminUsers: NotificationReliabilityResponse["users"];
}) {
  const router = useRouter();
  const toast = useToast();
  const [page, setPage] = useState(initialPage);
  const [isClearing, setIsClearing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number>(adminUsers[0]?.id ?? 0);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const { data, error, isValidating } = useSWR<LogsResponse>(`/api/admin/logs?page=${page}`, {
    fallbackData: initialData,
  });

  const { data: reliabilityData, error: reliabilityError, isValidating: reliabilityRefreshing } =
    useSWR<NotificationReliabilityResponse>("/api/admin/logs/notification-reliability", {
      fallbackData: { overview: initialReliability, users: adminUsers },
      refreshInterval: 30_000,
    });

  const rows = useMemo(() => data?.results ?? [], [data?.results]);
  const pageInfo = data?.pageInfo ?? initialData.pageInfo;
  const hasNext = pageInfo.page < pageInfo.pages;
  const hasPrev = pageInfo.page > 1;

  const reliability = reliabilityData?.overview ?? initialReliability;
  const reliabilityUsers = reliabilityData?.users ?? adminUsers;
  const channels = reliability.channels ?? [];
  const failures = reliability.recentFailures ?? [];
  const totalAttempts = channels.reduce((acc, item) => acc + item.totalAttempts, 0);
  const totalFailures = channels.reduce((acc, item) => acc + item.failureCount, 0);
  const totalRetries = channels.reduce((acc, item) => acc + item.retryCount, 0);

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    router.replace(`/admin/settings/logs?page=${nextPage}`);
  };

  const clearLogs = async () => {
    setIsClearing(true);
    try {
      const res = await csrfFetch("/api/admin/logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to clear logs");

      toast.success("Audit logs cleared successfully");
      const empty: LogsResponse = {
        results: [],
        pageInfo: { page: 1, pages: 1, results: 0, total: 0, limit: initialData.pageInfo.limit },
      };
      await mutate(`/api/admin/logs?page=${page}`, empty, false);
      await mutate(`/api/admin/logs?page=1`, empty, false);
      setPage(1);
      router.replace("/admin/settings/logs?page=1");
      await mutate(`/api/admin/logs?page=1`);
    } catch (clearError) {
      logger.error("[AdminLogs] Failed to clear logs", clearError);
      toast.error("Failed to clear audit logs. Please try again.");
    } finally {
      setIsClearing(false);
      setModalConfig((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const runReliabilityTest = async () => {
    if (!selectedUserId) {
      toast.error("Select a user first.");
      return;
    }
    setIsTesting(true);
    try {
      const res = await csrfFetch("/api/admin/logs/notification-reliability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to send test notification");
      toast.success(`Test sent: ${body.delivered}/${body.eligible} endpoints delivered.`);
      await mutate("/api/admin/logs/notification-reliability");
      await mutate(`/api/admin/logs?page=${page}`);
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Failed to send test notification";
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-sky-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.22),_rgba(17,24,39,0.98)_55%)] p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-200/70">Security + Reliability</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Audit Logs & Notification Reliability</h2>
            <p className="mt-1 text-sm text-slate-300">
              Track admin actions, delivery health, retries, and endpoint failures from one place.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center w-full md:w-auto">
            <div className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
              <div className="text-xs text-slate-400">Attempts</div>
              <div className="text-lg font-semibold text-white">{totalAttempts}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
              <div className="text-xs text-slate-400">Failures</div>
              <div className="text-lg font-semibold text-rose-200">{totalFailures}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
              <div className="text-xs text-slate-400">Retries</div>
              <div className="text-lg font-semibold text-amber-200">{totalRetries}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Audit Activity</h3>
                <p className="text-xs text-slate-400">
                  Total entries: <span className="font-semibold text-slate-100">{pageInfo.total}</span>
                  {isValidating ? <span className="ml-2 text-slate-500">Refreshing…</span> : null}
                </p>
              </div>
              {pageInfo.total > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setModalConfig({
                      isOpen: true,
                      title: "Clear Audit Logs?",
                      message: "Delete all audit logs? This action cannot be undone.",
                      variant: "danger",
                      onConfirm: () => void clearLogs(),
                    })
                  }
                  disabled={isClearing}
                  className="btn btn-sm btn-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isClearing ? "Clearing..." : "Clear All Logs"}
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              Failed to load audit logs.
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70">
            <div className="md:hidden divide-y divide-slate-800">
              {rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">No audit entries yet.</div>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className="p-3 space-y-2">
                    <div className="text-xs text-slate-400">{formatTimestamp(row.created_at)}</div>
                    <div className="text-sm font-medium text-white">{formatActionLabel(row.action)}</div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-200 truncate">{row.actor || "System"}</span>
                      <span className="text-slate-400 shrink-0">{row.ip ?? "-"}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <table className="min-w-full text-sm hidden md:table">
              <thead className="bg-slate-900 text-left text-xs uppercase tracking-wider text-slate-300">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                      No audit entries yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-900/70">
                      <td className="px-4 py-3 text-slate-300">{formatTimestamp(row.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-white">{formatActionLabel(row.action)}</td>
                      <td className="px-4 py-3 text-slate-200">{row.actor || "System"}</td>
                      <td className="px-4 py-3 text-slate-400">{row.ip ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/50 px-4 py-3 text-sm">
            <div className="text-slate-400">
              Page {pageInfo.page} of {pageInfo.pages}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                className="btn btn-sm btn-outline disabled:cursor-not-allowed disabled:opacity-50 flex-1 sm:flex-none"
                onClick={() => goToPage(pageInfo.page - 1)}
                disabled={!hasPrev}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline disabled:cursor-not-allowed disabled:opacity-50 flex-1 sm:flex-none"
                onClick={() => goToPage(pageInfo.page + 1)}
                disabled={!hasNext}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Notification Reliability</h3>
                <p className="text-xs text-slate-400">
                  Last {reliability.windowDays} days
                  {reliabilityRefreshing ? <span className="ml-2 text-slate-500">Refreshing…</span> : null}
                </p>
              </div>
            </div>

            {reliabilityError ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                Failed to load reliability data.
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {channels.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
                  No notification delivery attempts recorded yet.
                </div>
              ) : (
                channels.map((channel) => {
                  const percent = Math.round(channel.successRate * 100);
                  return (
                    <div key={channel.channel} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-white">{channelTitle(channel.channel)}</div>
                        <div className="text-xs text-slate-400">{channel.totalAttempts} attempts</div>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-800">
                        <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded bg-slate-800/80 px-2 py-1 text-slate-100">{percent}% ok</div>
                        <div className="rounded bg-slate-800/80 px-2 py-1 text-rose-200">{channel.failureCount} fail</div>
                        <div className="rounded bg-slate-800/80 px-2 py-1 text-amber-200">{channel.retryCount} retries</div>
                        <div className="rounded bg-slate-800/80 px-2 py-1 text-slate-300">{channel.skippedCount} skipped</div>
                      </div>
                      <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                        <div>Last send: {formatTimestamp(channel.lastAttemptAt)}</div>
                        {channel.lastError ? <div className="text-rose-300">Last error: {channel.lastError}</div> : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
            <h4 className="text-sm font-semibold text-white">Send Test To User</h4>
            <p className="mt-1 text-xs text-slate-400">
              Sends a live test notification through endpoints assigned to the selected user.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Select
                value={String(selectedUserId)}
                onValueChange={(value) => setSelectedUserId(Number(value))}
                disabled={reliabilityUsers.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {reliabilityUsers.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {user.displayName ? `${user.displayName} (${user.username})` : user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => void runReliabilityTest()}
                disabled={isTesting || reliabilityUsers.length === 0}
                className="btn btn-sm btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isTesting ? "Sending..." : "Send Test Notification"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
            <h4 className="text-sm font-semibold text-white">Recent Delivery Failures</h4>
            <div className="mt-3 space-y-2">
              {failures.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
                  No delivery failures recorded in this window.
                </div>
              ) : (
                failures.map((failure) => (
                  <div key={failure.id} className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-rose-100">{failure.endpointName}</span>
                      <span className="text-rose-300">{channelTitle(failure.channel)}</span>
                    </div>
                    <div className="mt-1 text-rose-200/90">
                      {failure.errorMessage || "Unknown error"}
                    </div>
                    <div className="mt-1 text-rose-300/80">
                      {failure.eventType} • attempt #{failure.attemptNumber} • {formatTimestamp(failure.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        variant={modalConfig.variant}
      />
    </section>
  );
}
