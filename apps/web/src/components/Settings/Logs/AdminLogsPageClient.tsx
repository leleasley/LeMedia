"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { ConfirmationModal } from "@/components/Common/ConfirmationModal";

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

function formatMeta(value: unknown) {
  if (!value) return "-";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatTimestamp(value: string) {
  // Use a fixed format/timezone to avoid hydration mismatches between server and client.
  try {
    return new Date(value).toISOString().replace("T", " ").replace("Z", " UTC");
  } catch {
    return value;
  }
}

export function AdminLogsPageClient({
  initialData,
  initialPage,
}: {
  initialData: LogsResponse;
  initialPage: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [page, setPage] = useState(initialPage);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const { data, error, isValidating } = useSWR<LogsResponse>(
    `/api/admin/logs?page=${page}`,
    { fallbackData: initialData }
  );

  const rows = useMemo(() => data?.results ?? [], [data?.results]);
  const pageInfo = data?.pageInfo ?? initialData.pageInfo;
  const hasNext = pageInfo.page < pageInfo.pages;
  const hasPrev = pageInfo.page > 1;

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    router.replace(`/admin/settings/logs?page=${nextPage}`);
  };

  const [isClearing, setIsClearing] = useState(false);
  
  const clearLogs = async () => {
    setIsClearing(true);
    try {
      const res = await csrfFetch("/api/admin/logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error("Failed to clear logs");
      }

      toast.success("Audit logs cleared successfully");
      // Optimistically clear cached pages and refetch page 1
      const empty: LogsResponse = {
        results: [],
        pageInfo: { page: 1, pages: 1, results: 0, total: 0, limit: initialData.pageInfo.limit },
      };
      await mutate(`/api/admin/logs?page=${page}`, empty, false);
      await mutate(`/api/admin/logs?page=1`, empty, false);
      setPage(1);
      router.replace("/admin/settings/logs?page=1");
      await mutate(`/api/admin/logs?page=1`);
    } catch (error) {
      console.error("Failed to clear logs:", error);
      toast.error("Failed to clear audit logs. Please try again.");
    } finally {
      setIsClearing(false);
      setModalConfig({ ...modalConfig, isOpen: false });
    }
  };

  const handleClearLogs = () => {
    setModalConfig({
      isOpen: true,
      title: "Clear Audit Logs?",
      message: "Are you sure you want to delete all audit logs? This action cannot be undone.",
      variant: "danger",
      onConfirm: () => void clearLogs()
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Audit Logs</h2>
          <p className="text-sm text-muted">
            Review admin actions and sensitive changes across the system.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted">
            Total entries: <span className="font-semibold text-white">{pageInfo.total}</span>
            {isValidating ? <span className="ml-2 text-gray-400">Refreshing…</span> : null}
          </div>
          {pageInfo.total > 0 && (
            <button
              type="button"
              onClick={handleClearLogs}
              disabled={isClearing}
              className="btn btn-sm btn-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isClearing ? "Clearing..." : "Clear All Logs"}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load audit logs.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-800 text-left text-xs uppercase tracking-wider text-gray-300">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">
                  No audit entries yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-800/70">
                  <td className="px-4 py-3 text-gray-200">
                    {formatTimestamp(row.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{row.actor}</td>
                  <td className="px-4 py-3 text-gray-200">{row.action}</td>
                  <td className="px-4 py-3 text-gray-200">{row.target ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-400">{row.ip ?? "-"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    <div className="max-w-[320px] break-words">{formatMeta(row.metadata)}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-gray-400">
          Page {pageInfo.page} of {pageInfo.pages}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => goToPage(pageInfo.page - 1)}
            disabled={!hasPrev}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => goToPage(pageInfo.page + 1)}
            disabled={!hasNext}
          >
            Next
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        variant={modalConfig.variant}
      />
    </section>
  );
}
