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
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAvatarSrc, getAvatarAlt } from "@/lib/avatar";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

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
  created_at: string;
  username: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  avatar_url?: string | null;
  jellyfin_user_id?: string | null;
};

type ViewMode = "grid" | "list";
type FilterStatus = "all" | "pending" | "submitted" | "downloading" | "available" | "partially_available" | "denied" | "failed";

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
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
  const router = useRouter();
  const toast = useToast();

  const handleAction = async (action: string, requestId: string | number) => {
    if (action === "approve" || action === "delete") {
      setOptimisticRemovals(prev => new Set(prev).add(requestId));
    }
    // For deny, update status optimistically instead of removing
    if (action === "deny") {
      setOptimisticStatusUpdates(prev => ({ ...prev, [requestId]: "denied" }));
    }

    const formData = new FormData();
    formData.append("requestId", String(requestId));

    if (action === "approve") await approveRequest(formData);
    else if (action === "deny") await denyRequest(formData);
    else if (action === "delete") await deleteRequest(formData);
    else if (action === "markAvailable") await markRequestAvailable(formData);

    router.refresh();
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
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-white/60 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getAvatarSrc({ avatarUrl: r.avatar_url, jellyfinUserId: r.jellyfin_user_id, username: r.username })}
                        alt={getAvatarAlt({ username: r.username })}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <span className="truncate">{r.username}</span>
                  </div>
                  <span className="whitespace-nowrap">{formatDate(r.created_at)}</span>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                  {r.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleAction("approve", r.id)}
                        className="flex-1 btn btn-primary btn-sm gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction("deny", r.id)}
                        className="flex-1 btn btn-outline btn-sm gap-1.5"
                      >
                        <X className="h-3.5 w-3.5" />
                        Deny
                      </button>
                    </>
                  )}
                  {r.status !== "available" && r.status !== "removed" && r.status !== "pending" && (
                    <button
                      onClick={() => handleAction("markAvailable", r.id)}
                      className="flex-1 btn btn-ghost btn-sm gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark Available
                    </button>
                  )}
                  <button
                    onClick={() => handleAction("delete", r.id)}
                    className="btn btn-error btn-sm gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
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
                            src={getAvatarSrc({ avatarUrl: r.avatar_url, jellyfinUserId: r.jellyfin_user_id, username: r.username })}
                            alt={getAvatarAlt({ username: r.username })}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <span className="text-white/80">{r.username}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="p-4 text-white/60 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {r.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleAction("approve", r.id)}
                              className="btn btn-primary btn-xs gap-1"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction("deny", r.id)}
                              className="btn btn-outline btn-xs gap-1"
                            >
                              <X className="h-3 w-3" />
                              Deny
                            </button>
                          </>
                        )}
                        {r.status !== "available" && r.status !== "removed" && r.status !== "pending" && (
                          <button
                            onClick={() => handleAction("markAvailable", r.id)}
                            className="btn btn-ghost btn-xs gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Mark
                          </button>
                        )}
                        <button
                          onClick={() => handleAction("delete", r.id)}
                          className="btn btn-error btn-xs gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
