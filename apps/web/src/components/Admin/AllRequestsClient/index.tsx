"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { formatDate } from "@/lib/dateFormat";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Trash2,
  Search,
  Filter,
  LayoutGrid,
  List,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Download,
  AlertCircle,
  Eye,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAvatarSrc, getAvatarAlt } from "@/lib/avatar";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { Modal } from "@/components/Common/Modal";
import { emitRequestsChanged } from "@/lib/request-refresh";
import { ReleaseSearchModal } from "@/components/Media/ReleaseSearchModal";
import { CommentsListForm } from "@/components/Requests/CommentsListForm";

const statusConfig: Record<string, {
  bg: string;
  text: string;
  border: string;
  icon: typeof CheckCircle2;
  label: string;
}> = {
  available: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    icon: CheckCircle2,
    label: "Available"
  },
  partially_available: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/30",
    icon: CheckCircle2,
    label: "Partially Available"
  },
  downloading: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    icon: Download,
    label: "Downloading"
  },
  submitted: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
    icon: RefreshCw,
    label: "Submitted"
  },
  pending: {
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    border: "border-sky-500/30",
    icon: Clock,
    label: "Pending"
  },
  denied: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    icon: XCircle,
    label: "Denied"
  },
  failed: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    icon: AlertCircle,
    label: "Failed"
  },
  removed: {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-slate-500/30",
    icon: XCircle,
    label: "Removed"
  },
  already_exists: {
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    border: "border-violet-500/30",
    icon: CheckCircle2,
    label: "Already Exists"
  }
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig["submitted"];
  const Icon = config.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border",
      config.bg,
      config.text,
      config.border
    )}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

type Request = {
  id: number | string;
  tmdb_id: number;
  title: string;
  request_type: string;
  status: string;
  status_reason?: string | null;
  created_at: string;
  username: string;
  display_name?: string | null;
  poster_path: string | null;
  backdrop_path?: string | null;
  avatar_url?: string | null;
  jellyfin_user_id?: string | null;
  mergedRequestIds?: string[];
};

type RequestDetails = {
  request: {
    id: string;
    title: string;
    requestType: string;
    status: string;
    statusReason?: string | null;
    createdAt: string;
    requestedBy: string;
  };
  summary: {
    total: number;
    pending: number;
    submitted: number;
    downloading: number;
    available: number;
    denied: number;
    failed: number;
  };
  items: Array<{
    id: number;
    provider: string;
    providerId: number | null;
    season: number | null;
    episode: number | null;
    status: string;
    createdAt: string;
  }>;
};

type ViewMode = "grid" | "list";
type FilterStatus = "all" | "pending" | "submitted" | "downloading" | "available" | "partially_available" | "denied" | "failed";

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

function isNextRedirectError(err: unknown) {
  const digest = typeof (err as { digest?: unknown })?.digest === "string"
    ? (err as { digest: string }).digest
    : "";
  const message = typeof (err as { message?: unknown })?.message === "string"
    ? (err as { message: string }).message
    : "";
  return digest.includes("NEXT_REDIRECT") || message.includes("NEXT_REDIRECT");
}

export function AllRequestsClient({
  initialRequests,
  approveRequest,
  denyRequest,
  deleteRequest,
  markRequestAvailable,
}: {
  initialRequests: Request[];
  approveRequest: (formData: FormData) => Promise<void>;
  denyRequest: (formData: FormData) => Promise<void>;
  deleteRequest: (formData: FormData) => Promise<void>;
  markRequestAvailable: (formData: FormData) => Promise<void>;
}) {
  const [optimisticRemovals, setOptimisticRemovals] = useState<Set<string | number>>(new Set());
  const [optimisticStatusUpdates, setOptimisticStatusUpdates] = useState<Record<string | number, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isSyncing, setIsSyncing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<RequestDetails | null>(null);
  const [detailsBaseRequest, setDetailsBaseRequest] = useState<Request | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const [detailsSuggestNoFiles, setDetailsSuggestNoFiles] = useState(false);
  const [episodeSearchOpen, setEpisodeSearchOpen] = useState(false);
  const [episodeForSearch, setEpisodeForSearch] = useState<{ seasonNumber: number; episodeNumber: number } | null>(null);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [denyTarget, setDenyTarget] = useState<{ requestId: string | number; requestIds?: Array<string | number> } | null>(null);
  const [denySubmitting, setDenySubmitting] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const handleAction = async (
    action: "approve" | "deny" | "delete" | "markAvailable",
    requestId: string | number,
    requestIds?: Array<string | number>,
    reason?: string | null
  ) => {
    const targetIds = (requestIds && requestIds.length ? requestIds : [requestId]).map(String);
    const previousRemovals = new Set(optimisticRemovals);
    const previousStatusUpdates = { ...optimisticStatusUpdates };

    if (action === "approve" || action === "delete") {
      setOptimisticRemovals(prev => {
        const next = new Set(prev);
        targetIds.forEach((id) => next.add(id));
        return next;
      });
    }
    if (action === "deny") {
      setOptimisticStatusUpdates(prev => {
        const next = { ...prev };
        targetIds.forEach((id) => {
          next[id] = "denied";
        });
        return next;
      });
    }

    try {
      for (const id of targetIds) {
        const formData = new FormData();
        formData.append("requestId", String(id));
        if (action === "deny" && reason) {
          formData.append("reason", reason);
        }

        try {
          if (action === "approve") await approveRequest(formData);
          else if (action === "deny") await denyRequest(formData);
          else if (action === "delete") await deleteRequest(formData);
          else if (action === "markAvailable") await markRequestAvailable(formData);
        } catch (err) {
          if (!isNextRedirectError(err)) throw err;
        }
      }

      router.refresh();
      emitRequestsChanged();
    } catch (err: any) {
      setOptimisticRemovals(previousRemovals);
      setOptimisticStatusUpdates(previousStatusUpdates);
      toast.error(err?.message ?? "Action failed", { timeoutMs: 4000 });
    }
  };

  const openDenyModal = (requestId: string | number, requestIds?: Array<string | number>, reasonPreset = "") => {
    setDenyTarget({ requestId, requestIds });
    setDenyReason(reasonPreset.slice(0, 500));
    setDenyModalOpen(true);
  };

  const confirmDeny = async () => {
    if (!denyTarget || denySubmitting) return;
    setDenySubmitting(true);
    try {
      const reason = denyReason.trim().slice(0, 500) || null;
      await handleAction("deny", denyTarget.requestId, denyTarget.requestIds, reason);
      setDenyModalOpen(false);
      setDenyTarget(null);
      setDenyReason("");
    } finally {
      setDenySubmitting(false);
    }
  };

  const openDetails = async (request: Request) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsData(null);
    setDetailsBaseRequest(request);
    setDetailsNotice(null);
    setDetailsSuggestNoFiles(false);
    try {
      const idsQuery = (request.mergedRequestIds && request.mergedRequestIds.length > 1)
        ? `?ids=${encodeURIComponent(request.mergedRequestIds.map(String).join(","))}`
        : "";
      const res = await csrfFetch(`/api/v1/admin/requests/${request.id}${idsQuery}`, { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load request details");
      setDetailsData(data as RequestDetails);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load request details", { timeoutMs: 4000 });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleTryFindFiles = async () => {
    if (!detailsBaseRequest || isSyncing) return;
    setDetailsNotice(null);
    setDetailsSuggestNoFiles(false);
    setIsSyncing(true);
    try {
      const ids = detailsBaseRequest.mergedRequestIds?.length
        ? detailsBaseRequest.mergedRequestIds
        : [String(detailsBaseRequest.id)];
      let suggestNoFiles = false;
      let message = "Search started.";
      for (const id of ids) {
        const res = await csrfFetch(`/api/v1/admin/requests/${id}/search`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Search failed");
        suggestNoFiles = suggestNoFiles || Boolean(data?.suggestNoFiles);
        if (typeof data?.message === "string" && data.message.trim()) {
          message = data.message;
        }
      }
      setDetailsNotice(message);
      setDetailsSuggestNoFiles(suggestNoFiles);
      emitRequestsChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Sync failed", { timeoutMs: 4000 });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await csrfFetch("/api/v1/admin/requests/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Sync failed");
      }
      if (data?.message) {
        toast.success(data.message, { timeoutMs: 3000 });
      }
      router.refresh();
      emitRequestsChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Sync failed", { timeoutMs: 4000 });
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredRequests = useMemo(() => {
    return initialRequests
      .filter(r => !optimisticRemovals.has(r.id))
      .map(r => ({
        ...r,
        status: optimisticStatusUpdates[r.id] ?? r.status
      }))
      .filter(r => {
        if (filterStatus === "all") return true;
        return r.status === filterStatus;
      })
      .filter(r => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
          r.title.toLowerCase().includes(query) ||
          r.username.toLowerCase().includes(query)
        );
      });
  }, [initialRequests, optimisticRemovals, optimisticStatusUpdates, filterStatus, searchQuery]);

  const stats = useMemo(() => {
    const visible = initialRequests
      .filter(r => !optimisticRemovals.has(r.id))
      .map(r => ({
        ...r,
        status: optimisticStatusUpdates[r.id] ?? r.status
      }));
    return {
      total: visible.length,
      pending: visible.filter(r => r.status === "pending").length,
      submitted: visible.filter(r => r.status === "submitted").length,
      downloading: visible.filter(r => r.status === "downloading").length,
      partiallyAvailable: visible.filter(r => r.status === "partially_available").length,
      available: visible.filter(r => r.status === "available").length,
      denied: visible.filter(r => r.status === "denied").length,
      failed: visible.filter(r => r.status === "failed").length,
    };
  }, [initialRequests, optimisticRemovals, optimisticStatusUpdates]);

  return (
    <div className="space-y-6">
      <Modal
        open={denyModalOpen}
        title="Deny Request"
        onClose={() => {
          if (denySubmitting) return;
          setDenyModalOpen(false);
          setDenyTarget(null);
          setDenyReason("");
        }}
      >
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Reason
          </label>
          <textarea
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value.slice(0, 500))}
            placeholder="Optional reason shown to admins/users"
            className="min-h-[120px] w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
          />
          <div className="text-right text-xs text-white/40">{denyReason.length}/500</div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDenyModalOpen(false);
                setDenyTarget(null);
                setDenyReason("");
              }}
              disabled={denySubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-error btn-sm gap-2"
              onClick={confirmDeny}
              disabled={denySubmitting}
            >
              {denySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Confirm Deny
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={detailsOpen}
        title={detailsData ? `Request Details: ${detailsData.request.title}` : "Request Details"}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsData(null);
          setDetailsBaseRequest(null);
          setDetailsNotice(null);
          setDetailsSuggestNoFiles(false);
          setEpisodeSearchOpen(false);
          setEpisodeForSearch(null);
        }}
      >
        {detailsLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading request details...
          </div>
        ) : !detailsData ? (
          <div className="py-4 text-sm text-gray-300">No details available.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-gray-200">
              <div>Status: <span className="font-semibold">{formatStatusLabel(detailsData.request.status)}</span></div>
              {detailsData.request.statusReason ? (
                <div className="mt-1 text-amber-300">Reason: {detailsData.request.statusReason}</div>
              ) : null}
            </div>
            {detailsBaseRequest ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Actions</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detailsData.request.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAction("approve", detailsBaseRequest.id, detailsBaseRequest.mergedRequestIds)}
                        className="btn btn-primary btn-sm gap-2"
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => openDenyModal(detailsBaseRequest.id, detailsBaseRequest.mergedRequestIds)}
                        className="btn btn-outline btn-sm gap-2"
                      >
                        <X className="h-4 w-4" />
                        Deny
                      </button>
                    </>
                  ) : null}
                  {["submitted", "downloading", "partially_available"].includes(detailsData.request.status) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openDenyModal(detailsBaseRequest.id, detailsBaseRequest.mergedRequestIds)}
                        className="btn btn-outline btn-sm gap-2"
                      >
                        <X className="h-4 w-4" />
                        Deny
                      </button>
                      <button
                        type="button"
                        onClick={() => openDenyModal(detailsBaseRequest.id, detailsBaseRequest.mergedRequestIds, "No files available")}
                        className="btn btn-outline btn-sm"
                      >
                        No files available
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction("markAvailable", detailsBaseRequest.id, detailsBaseRequest.mergedRequestIds)}
                        className="btn btn-ghost btn-sm gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark Available
                      </button>
                    </>
                  ) : null}
                  {["available", "denied", "removed"].includes(detailsData.request.status) ? (
                    <button
                      type="button"
                      onClick={() => handleAction("delete", detailsBaseRequest.id, detailsBaseRequest.mergedRequestIds)}
                      className="btn btn-error btn-sm gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {detailsBaseRequest?.request_type === "episode" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTryFindFiles}
                  disabled={isSyncing}
                  className="btn btn-outline btn-sm gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                  Try Find Files
                </button>
                {detailsNotice ? (
                  <span className={cn("text-xs", detailsSuggestNoFiles ? "text-amber-300" : "text-emerald-300")}>{detailsNotice}</span>
                ) : null}
              </div>
            )}
            {detailsSuggestNoFiles && detailsBaseRequest ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-3">
                <span>No files available. You can mark this request as no files available.</span>
                <button
                  type="button"
                  onClick={() => openDenyModal(detailsBaseRequest.id, detailsBaseRequest.mergedRequestIds, "No files available")}
                  className="btn btn-outline btn-xs"
                >
                  Mark No Files
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="rounded border border-white/10 bg-white/5 px-2 py-1">Total: {detailsData.summary.total}</div>
              <div className="rounded border border-white/10 bg-white/5 px-2 py-1">Pending: {detailsData.summary.pending}</div>
              <div className="rounded border border-white/10 bg-white/5 px-2 py-1">Submitted: {detailsData.summary.submitted}</div>
              <div className="rounded border border-white/10 bg-white/5 px-2 py-1">Available: {detailsData.summary.available}</div>
              <div className="rounded border border-white/10 bg-white/5 px-2 py-1">Downloading: {detailsData.summary.downloading}</div>
              <div className="rounded border border-white/10 bg-white/5 px-2 py-1">Denied: {detailsData.summary.denied}</div>
              <div className="rounded border border-white/10 bg-white/5 px-2 py-1">Failed: {detailsData.summary.failed}</div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left px-2 py-2">Episode</th>
                    <th className="text-left px-2 py-2">Status</th>
                    <th className="text-left px-2 py-2">Provider</th>
                    {detailsBaseRequest?.request_type === "episode" ? <th className="text-left px-2 py-2">Search</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {detailsData.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-2 py-2 text-gray-200">
                        {item.season != null && item.episode != null
                          ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`
                          : "N/A"}
                      </td>
                      <td className="px-2 py-2 text-gray-100">{formatStatusLabel(item.status)}</td>
                      <td className="px-2 py-2 text-gray-400">{item.provider}{item.providerId ? ` #${item.providerId}` : ""}</td>
                      {detailsBaseRequest?.request_type === "episode" ? (
                        <td className="px-2 py-2">
                          {item.season != null && item.episode != null ? (
                            <button
                              type="button"
                              className={cn(
                                "btn btn-ghost btn-xs",
                                item.status === "available" && "opacity-50 cursor-not-allowed"
                              )}
                              disabled={item.status === "available"}
                              onClick={() => {
                                if (item.status === "available") return;
                                setEpisodeForSearch({ seasonNumber: item.season!, episodeNumber: item.episode! });
                                setEpisodeSearchOpen(true);
                              }}
                            >
                              {item.status === "available" ? "Available" : "Exact Search"}
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detailsBaseRequest?.request_type === "episode" &&
              detailsData.summary.available === 0 &&
              ["pending", "submitted", "downloading", "partially_available"].includes(detailsData.request.status) ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                No files available right now for the selected episodes.
              </div>
            ) : null}
            {detailsBaseRequest && (
              <div className="border-t border-white/10 pt-4">
                <CommentsListForm
                  requestId={String(detailsBaseRequest.id)}
                  isAdmin
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-4 shadow-lg">
          <div className="text-xs font-medium text-white/60 uppercase tracking-wider">Total</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-sky-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-sky-400 uppercase tracking-wider">Pending</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.pending}</div>
        </div>
        <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-blue-400 uppercase tracking-wider">Submitted</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.submitted}</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-amber-400 uppercase tracking-wider">Downloading</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.downloading}</div>
        </div>
        <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-purple-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-purple-400 uppercase tracking-wider">Partial</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.partiallyAvailable}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Available</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.available}</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-red-400 uppercase tracking-wider">Denied</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.denied}</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-red-400 uppercase tracking-wider">Failed</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.failed}</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
              <Search className="h-4 w-4 text-white/60" />
            </div>
            <input
              type="text"
              placeholder="Search by title or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-4 pr-12 rounded-lg border border-white/10 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="btn btn-outline btn-sm gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
              Sync
            </button>
            <button
              onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
              className="btn btn-outline btn-sm gap-2"
            >
              {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              {viewMode === "grid" ? "List" : "Grid"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["all", "partially_available", "available", "pending", "submitted", "downloading", "denied", "failed"] as FilterStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                filterStatus === status
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              {formatStatusLabel(status)}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-12 text-center shadow-lg">
          <Filter className="h-12 w-12 mx-auto text-white/20 mb-4" />
          <div className="text-lg font-semibold text-white">No requests found</div>
          <div className="text-sm text-white/60 mt-2">Try adjusting your filters or search query</div>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRequests.map((r) => (
            <div
              key={r.id}
              className="group relative rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-lg hover:shadow-2xl hover:border-white/20 transition-all duration-300"
            >
              {/* Backdrop */}
              {r.backdrop_path && (
                <div className="absolute inset-0 z-0 opacity-20">
                  <Image
                    src={r.backdrop_path}
                    alt={r.title}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent" />
                </div>
              )}

              <div className="relative z-10 p-4 space-y-3">
                <div className="flex gap-3">
                  <div className="relative w-16 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-black/40 ring-1 ring-white/10 shadow-xl">
                    {r.poster_path ? (
                      <Image
                        src={r.poster_path}
                        alt={r.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[8px] text-white/40">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white truncate">{r.title}</div>
                    <div className="text-xs text-white/60 uppercase tracking-wider mt-1">
                      {r.request_type === "movie" ? "Movie" : "TV Show"}
                    </div>
                    <div className="mt-2">
                      <StatusBadge status={r.status} />
                    </div>
                    {r.status_reason && (
                      <div className="mt-2 text-xs text-amber-300/90">
                        Reason: {r.status_reason}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-white/60 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getAvatarSrc({
                          avatarUrl: r.avatar_url,
                          jellyfinUserId: r.jellyfin_user_id,
                          displayName: r.display_name ?? null,
                          username: r.username
                        })}
                        alt={getAvatarAlt({ displayName: r.display_name ?? null, username: r.username })}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <span className="truncate">{r.display_name || r.username}</span>
                  </div>
                  <span className="whitespace-nowrap">{formatDate(r.created_at)}</span>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                  {r.request_type === "episode" && (
                    <button
                      onClick={() => openDetails(r)}
                      className="w-full btn btn-ghost btn-sm gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View Details
                    </button>
                  )}
                  {r.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleAction("approve", r.id, r.mergedRequestIds)}
                        className="flex-1 btn btn-primary btn-sm gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => openDenyModal(r.id, r.mergedRequestIds)}
                        className="flex-1 btn btn-outline btn-sm gap-1.5 text-rose-300 border-rose-500/40 hover:bg-rose-500/10"
                      >
                        <X className="h-3.5 w-3.5" />
                        Deny
                      </button>
                    </>
                  )}
                  {["submitted", "downloading", "partially_available"].includes(r.status) && (
                    <button
                      onClick={() => openDenyModal(r.id, r.mergedRequestIds)}
                      className="btn btn-outline btn-xs gap-1.5 text-rose-300 border-rose-500/40 hover:bg-rose-500/10"
                    >
                      <X className="h-3.5 w-3.5" />
                      Deny
                    </button>
                  )}
                  {["available", "denied", "removed"].includes(r.status) && (
                    <button
                      onClick={() => handleAction("delete", r.id, r.mergedRequestIds)}
                      className="btn btn-error btn-xs gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-4 pl-6 text-left font-semibold text-white/80">Poster</th>
                  <th className="p-4 text-left font-semibold text-white/80">Title</th>
                  <th className="p-4 text-left font-semibold text-white/80">User</th>
                  <th className="p-4 text-left font-semibold text-white/80">Status</th>
                  <th className="p-4 text-left font-semibold text-white/80">Date</th>
                  <th className="p-4 text-left font-semibold text-white/80">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRequests.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-3 pl-6">
                      <div className="relative w-10 h-14 rounded overflow-hidden bg-black/20 shadow-sm border border-white/5">
                        {r.poster_path ? (
                          <Image
                            src={r.poster_path}
                            alt={r.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[8px] text-white/40">
                            No Img
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-white">{r.title}</div>
                      <div className="text-xs text-white/60 uppercase tracking-wider mt-0.5">
                        {r.request_type}
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getAvatarSrc({
                              avatarUrl: r.avatar_url,
                              jellyfinUserId: r.jellyfin_user_id,
                              displayName: r.display_name ?? null,
                              username: r.username
                            })}
                            alt={getAvatarAlt({ displayName: r.display_name ?? null, username: r.username })}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <span className="text-white/80">{r.display_name || r.username}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={r.status} />
                      {r.status_reason && (
                        <div className="mt-1 text-xs text-amber-300/90">
                          Reason: {r.status_reason}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-white/60 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {r.request_type === "episode" && (
                          <button
                            onClick={() => openDetails(r)}
                            className="btn btn-ghost btn-xs gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            Details
                          </button>
                        )}
                        {r.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleAction("approve", r.id, r.mergedRequestIds)}
                              className="btn btn-primary btn-xs gap-1"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              onClick={() => openDenyModal(r.id, r.mergedRequestIds)}
                              className="btn btn-outline btn-xs gap-1 text-rose-300 border-rose-500/40 hover:bg-rose-500/10"
                            >
                              <X className="h-3 w-3" />
                              Deny
                            </button>
                          </>
                        )}
                        {["submitted", "downloading", "partially_available"].includes(r.status) && (
                          <button
                            onClick={() => openDenyModal(r.id, r.mergedRequestIds)}
                            className="btn btn-outline btn-xs gap-1 text-rose-300 border-rose-500/40 hover:bg-rose-500/10"
                          >
                            <X className="h-3 w-3" />
                            Deny
                          </button>
                        )}
                        {["available", "denied", "removed"].includes(r.status) && (
                          <button
                            onClick={() => handleAction("delete", r.id, r.mergedRequestIds)}
                            className="btn btn-error btn-xs gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {detailsBaseRequest && episodeForSearch ? (
        <ReleaseSearchModal
          open={episodeSearchOpen}
          onClose={() => {
            setEpisodeSearchOpen(false);
            setEpisodeForSearch(null);
          }}
          mediaType="tv"
          mediaId={
            detailsData?.items.find((i) => i.provider === "sonarr" && i.providerId != null)?.providerId ?? null
          }
          tmdbId={detailsBaseRequest.tmdb_id}
          title={`${detailsBaseRequest.title} · S${String(episodeForSearch.seasonNumber).padStart(2, "0")}E${String(episodeForSearch.episodeNumber).padStart(2, "0")}`}
          searchTitle={detailsBaseRequest.title}
          posterUrl={detailsBaseRequest.poster_path ?? null}
          backdropUrl={detailsBaseRequest.backdrop_path ?? null}
          seasonNumber={episodeForSearch.seasonNumber}
          episodeNumber={episodeForSearch.episodeNumber}
          preferProwlarr
          strictMatch
        />
      ) : null}
    </div>
  );
}
