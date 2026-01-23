"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCcw, Search, Sparkles, ChevronDown, X, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import type { UpgradeFinderItem } from "@/lib/upgrade-finder";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

const statusStyles: Record<UpgradeFinderItem["upgradeStatus"], { label: string; bg: string; text: string; border: string }> = {
  missing: {
    label: "Missing",
    bg: "bg-slate-500/10",
    text: "text-slate-300",
    border: "border-slate-500/30"
  },
  upgrade: {
    label: "Upgrade Available",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/30"
  },
  partial: {
    label: "Partial",
    bg: "bg-sky-500/10",
    text: "text-sky-300",
    border: "border-sky-500/30"
  },
  "up-to-date": {
    label: "Up to Date",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    border: "border-emerald-500/30"
  }
};

type HintStatus = "checking" | "available" | "none" | "error" | "idle";

const hintStyles: Record<HintStatus, { label: string; bg: string; text: string; border: string }> = {
  checking: {
    label: "Checking",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/30"
  },
  available: {
    label: "4K available",
    bg: "bg-violet-500/15",
    text: "text-violet-200",
    border: "border-violet-500/40"
  },
  none: {
    label: "No 4K found",
    bg: "bg-slate-500/10",
    text: "text-slate-300",
    border: "border-slate-500/30"
  },
  error: {
    label: "Check failed",
    bg: "bg-red-500/10",
    text: "text-red-300",
    border: "border-red-500/30"
  },
  idle: {
    label: "Not checked",
    bg: "bg-white/5",
    text: "text-white/50",
    border: "border-white/10"
  }
};

type ReleaseRow = {
  guid: string;
  indexerId: number | null;
  title: string;
  indexer: string;
  protocol: string;
  downloadUrl: string;
  size: number | null;
  age: number | null;
  seeders: number | null;
  leechers: number | null;
  quality: string;
  language: string;
  rejected: string[];
};

function formatBytes(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatAge(days?: number | null) {
  if (days === null || days === undefined || Number.isNaN(days)) return "—";
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${Math.round(days)}d`;
}

function itemKey(item: Pick<UpgradeFinderItem, "mediaType" | "id">) {
  return `${item.mediaType}:${item.id}`;
}

function InteractiveSearchModal(props: {
  open: boolean;
  item: UpgradeFinderItem | null;
  releases: ReleaseRow[];
  isLoading: boolean;
  filter: "all" | "4k";
  onFilterChange: (value: "all" | "4k") => void;
  onClose: () => void;
  onRefresh: () => void;
  onGrab: (release: ReleaseRow, forceGrab: boolean) => void;
  grabbingGuid: string | null;
}) {
  const { open, item, releases, isLoading, filter, onFilterChange, onClose, onRefresh, onGrab, grabbingGuid } = props;
  const [forceGrab, setForceGrab] = useState(false);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !item) return null;

  const filtered = filter === "4k"
    ? releases.filter(release => {
        const title = release.title.toLowerCase();
        const quality = release.quality.toLowerCase();
        return title.includes("4k") || title.includes("2160") || quality.includes("4k") || quality.includes("2160");
      })
    : releases;

  const modal = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Interactive Search"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[95vw] lg:max-w-7xl h-[95vh] flex flex-col rounded-xl sm:rounded-2xl glass-strong border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="flex-shrink-0 p-4 sm:p-6 border-b border-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-white">Interactive Search</h2>
              <div className="text-xs sm:text-sm text-white/60 mt-1 truncate">
                {item.title} {item.year ? `(${item.year})` : ""} • {item.mediaType === "movie" ? "Movie" : "Series"}
              </div>
              <div className="text-xs text-white/40 mt-1">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} {filter === "4k" && `(filtered from ${releases.length})`}
              </div>
              {forceGrab && item.mediaType === "movie" && (
                <div className="text-xs text-amber-300 mt-1 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                  Force Grab enabled - will use Ultra-HD profile
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-36">
                  <Select value={filter} onValueChange={value => onFilterChange(value as "all" | "4k")}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Results</SelectItem>
                      <SelectItem value="4k">4K Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Close</span>
                </button>
              </div>
              {item.mediaType === "movie" && (
                <div className="flex flex-col gap-1">
                  <label
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer transition-colors"
                    title="Temporarily switch to Ultra-HD profile to bypass quality restrictions"
                  >
                    <input
                      type="checkbox"
                      checked={forceGrab}
                      onChange={(e) => setForceGrab(e.target.checked)}
                      className="h-4 w-4 rounded border-amber-500/50 bg-amber-500/10 text-amber-500 focus:ring-2 focus:ring-amber-500/50"
                    />
                    <span className="text-xs font-semibold text-amber-200 whitespace-nowrap">Force Grab</span>
                  </label>
                  <div className="text-[10px] text-white/40 px-3 max-w-[200px]">
                    Bypass quality profile restrictions
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 bg-white/5 sticky top-0 z-10">
                  <tr className="text-[10px] sm:text-[11px] uppercase tracking-wide text-white/50">
                    <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Protocol</th>
                    <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Age</th>
                    <th className="px-2 sm:px-3 py-2 min-w-[200px]">Title</th>
                    <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Indexer</th>
                    <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Size</th>
                    <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Peers</th>
                    <th className="px-2 sm:px-3 py-2 whitespace-nowrap hidden lg:table-cell">Lang</th>
                    <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Quality</th>
                    <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap sticky right-0 bg-white/5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-white/50">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <div>Loading releases...</div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-white/50">
                        <div className="font-semibold">No releases found</div>
                        <div className="text-xs mt-1">Try adjusting your filter or refreshing</div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((release) => {
                      const rejected = release.rejected.length > 0;
                      const rowMuted = rejected ? "opacity-50" : "";
                      const rowKey = release.guid || `${release.indexerId ?? "x"}-${release.title}`;
                      const is4k = release.title.toLowerCase().includes("4k") ||
                                   release.title.toLowerCase().includes("2160") ||
                                   release.quality.toLowerCase().includes("4k") ||
                                   release.quality.toLowerCase().includes("2160");

                      return (
                        <tr key={rowKey} className={cn("hover:bg-white/5 transition-colors", rowMuted)}>
                          <td className="px-2 sm:px-3 py-3">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                              release.protocol === "torrent"
                                ? "bg-violet-500/20 text-violet-300"
                                : "bg-sky-500/20 text-sky-300"
                            )}>
                              {release.protocol || "—"}
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 py-3 text-white/70 whitespace-nowrap">{formatAge(release.age)}</td>
                          <td className="px-2 sm:px-3 py-3">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className={cn("font-medium leading-tight", is4k ? "text-violet-200" : "text-white")}>
                                  {release.title}
                                </div>
                                {rejected && (
                                  <div className="text-[10px] text-rose-300 mt-1">
                                    ⚠ {release.rejected.join(", ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 sm:px-3 py-3 text-white/70 text-[11px]">
                            <div className="max-w-[100px] truncate" title={release.indexer}>
                              {release.indexer || "—"}
                            </div>
                          </td>
                          <td className="px-2 sm:px-3 py-3 text-white/70 whitespace-nowrap font-medium">
                            {formatBytes(release.size ?? undefined)}
                          </td>
                          <td className="px-2 sm:px-3 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-emerald-300 font-semibold">{release.seeders ?? "—"}</span>
                              <span className="text-white/40">/</span>
                              <span className="text-rose-300">{release.leechers ?? "—"}</span>
                            </div>
                          </td>
                          <td className="px-2 sm:px-3 py-3 text-white/70 text-[11px] hidden lg:table-cell">
                            {release.language || "—"}
                          </td>
                          <td className="px-2 sm:px-3 py-3 whitespace-nowrap">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold",
                              is4k
                                ? "bg-violet-500/20 text-violet-200 border border-violet-500/30"
                                : "bg-white/5 text-white/70"
                            )}>
                              {release.quality || "—"}
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 py-3 text-right sticky right-0 bg-slate-900/60 backdrop-blur-sm">
                            <button
                              type="button"
                              disabled={grabbingGuid === release.guid || rejected}
                              onClick={() => onGrab(release, forceGrab)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] sm:text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                            >
                              {grabbingGuid === release.guid ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span className="hidden sm:inline">Grabbing...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="h-3 w-3" />
                                  <span className="hidden sm:inline">Grab</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}

export function UpgradeFinderClient({ initialItems }: { initialItems: UpgradeFinderItem[] }) {
  const toast = useToast();
  const [items, setItems] = useState<UpgradeFinderItem[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UpgradeFinderItem["upgradeStatus"]>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [hintMap, setHintMap] = useState<Record<string, { status: HintStatus; text?: string; checkedAt?: string }>>({});
  const [activeItem, setActiveItem] = useState<UpgradeFinderItem | null>(null);
  const [interactiveReleases, setInteractiveReleases] = useState<ReleaseRow[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [releaseFilter, setReleaseFilter] = useState<"all" | "4k">("all");
  const [grabbingGuid, setGrabbingGuid] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const statusOrder: Record<UpgradeFinderItem["upgradeStatus"], number> = {
      upgrade: 0,
      missing: 1,
      partial: 2,
      "up-to-date": 3
    };

    return items
      .filter(item => (typeFilter === "all" ? true : item.mediaType === typeFilter))
      .filter(item => (statusFilter === "all" ? true : item.upgradeStatus === statusFilter))
      .filter(item => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return item.title.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const statusDiff = statusOrder[a.upgradeStatus] - statusOrder[b.upgradeStatus];
        if (statusDiff !== 0) return statusDiff;
        return a.title.localeCompare(b.title);
      });
  }, [items, searchQuery, typeFilter, statusFilter]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/v1/admin/upgrade-finder", { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Refresh failed");
      setItems(body?.items ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setHintMap(prev => {
      const next = { ...prev };
      for (const item of items) {
        const key = itemKey(item);
        if (item.hintStatus) {
          next[key] = {
            status: item.hintStatus as HintStatus,
            text: item.hintText ?? undefined,
            checkedAt: item.checkedAt ?? undefined
          };
        } else if (!next[key]) {
          next[key] = { status: "idle" };
        }
      }
      return next;
    });
  }, [items]);

  const loadInteractiveReleases = async (item: UpgradeFinderItem) => {
    setIsLoadingReleases(true);
    try {
      const params = new URLSearchParams({ mediaType: item.mediaType, id: String(item.id) });
      const res = await fetch(`/api/v1/admin/upgrade-finder/releases?${params.toString()}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load releases");
      setInteractiveReleases(body?.items ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load releases");
    } finally {
      setIsLoadingReleases(false);
    }
  };

  const openInteractiveSearch = async (item: UpgradeFinderItem) => {
    setActiveItem(item);
    setReleaseFilter("all");
    setInteractiveReleases([]);
    await loadInteractiveReleases(item);
  };

  const closeInteractiveSearch = () => {
    setActiveItem(null);
    setInteractiveReleases([]);
    setGrabbingGuid(null);
  };

  const handleGrabRelease = async (release: ReleaseRow, forceGrab: boolean) => {
    if (!activeItem || grabbingGuid) return;
    setGrabbingGuid(release.guid);
    try {
      const res = await csrfFetch("/api/v1/admin/upgrade-finder/grab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: activeItem.mediaType,
          mediaId: activeItem.id,
          guid: release.guid,
          indexerId: release.indexerId ?? undefined,
          downloadUrl: release.downloadUrl || undefined,
          title: release.title,
          protocol: release.protocol,
          forceGrab: forceGrab
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Grab failed");
      toast.success(body?.message ?? "Release queued", { timeoutMs: 2500 });
    } catch (err: any) {
      toast.error(err?.message ?? "Grab failed");
    } finally {
      setGrabbingGuid(null);
    }
  };

  const handleSearchUpgrade = async (item: UpgradeFinderItem) => {
    const key = itemKey(item);
    if (runningIds.has(key)) return;
    setRunningIds(prev => new Set(prev).add(key));
    try {
      const res = await csrfFetch("/api/v1/admin/upgrade-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: item.mediaType, id: item.id, mode: "search" })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Search failed");
      toast.success(body?.message ?? "Search triggered", { timeoutMs: 2500 });
    } catch (err: any) {
      toast.error(err?.message ?? "Search failed");
    } finally {
      setRunningIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const runCheck = async (item: UpgradeFinderItem, { silent }: { silent: boolean }) => {
    const key = itemKey(item);
    try {
      setHintMap(prev => ({ ...prev, [key]: { status: "checking" } }));
      const res = await csrfFetch("/api/v1/admin/upgrade-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: item.mediaType, id: item.id, mode: "check" })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Check failed");
      setHintMap(prev => ({
        ...prev,
        [key]: {
          status: (body?.status as HintStatus) ?? (String(body?.hint ?? "").toLowerCase().includes("4k") ? "available" : "none"),
          text: body?.status === "error" ? undefined : (body?.hint ?? undefined),
          checkedAt: new Date().toISOString()
        }
      }));
    } catch {
      setHintMap(prev => ({ ...prev, [key]: { status: "error" } }));
      if (!silent) {
        toast.error("Check failed");
      }
    }
  };

  const handleCheckUpgrade = async (item: UpgradeFinderItem) => {
    const key = itemKey(item);
    if (runningIds.has(key)) return;
    setRunningIds(prev => new Set(prev).add(key));
    try {
      await runCheck(item, { silent: false });
    } finally {
      setRunningIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };


  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-lg shadow-black/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search title..."
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40"
              />
            </div>
            <div className="w-full min-w-[180px] sm:w-44">
              <Select value={typeFilter} onValueChange={value => setTypeFilter(value as "all" | "movie" | "tv")}>
                <SelectTrigger>
                  <SelectValue placeholder="All Media" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Media</SelectItem>
                  <SelectItem value="movie">Movies</SelectItem>
                  <SelectItem value="tv">Series</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full min-w-[180px] sm:w-48">
              <Select
                value={statusFilter}
                onValueChange={value => setStatusFilter(value as "all" | UpgradeFinderItem["upgradeStatus"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="upgrade">Upgrade Available</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="up-to-date">Up to Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
            disabled={isRefreshing}
          >
            <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/60 shadow-lg shadow-black/10">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Present</th>
                <th className="px-4 py-3">Upgrade</th>
                <th className="px-4 py-3">Hint</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-white/50">
                    No results yet.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const status = statusStyles[item.upgradeStatus];
                  const key = itemKey(item);
                  const isRunning = runningIds.has(key);
                  const hintState = hintMap[key] ?? { status: "idle" as HintStatus };
                  const hintStyle = hintStyles[hintState.status];
                  return (
                    <tr key={`${item.mediaType}-${item.id}`} className="hover:bg-white/5">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-white">{item.title}</div>
                        <div className="text-xs text-white/50">
                          {item.mediaType === "movie" ? "Movie" : "Series"}
                          {item.year ? ` • ${item.year}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-white/90 font-semibold">{item.currentQuality}</div>
                        <div className="text-xs text-white/50">{formatBytes(item.currentSizeBytes)}</div>
                        {item.mediaType === "tv" && item.totalEpisodeCount ? (
                          <div className="text-[11px] text-white/40">
                            Episodes: {item.episodeFileCount ?? 0}/{item.totalEpisodeCount}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", status.bg, status.text, status.border)}>
                          {status.label}
                        </span>
                        <div className="mt-2 text-xs text-white/60">
                          Target: {item.targetQuality ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", hintStyle.bg, hintStyle.text, hintStyle.border)}>
                          {hintStyle.label}
                        </span>
                        {hintState.text && hintState.status !== "error" && (
                          <div className="mt-2 text-[11px] text-white/50">{hintState.text}</div>
                        )}
                        {hintState.checkedAt && (
                          <div className="mt-1 text-[10px] text-white/40">
                            Checked {new Date(hintState.checkedAt).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              disabled={isRunning}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-lg border border-white/10 bg-indigo-600/20 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30",
                                isRunning && "opacity-70"
                              )}
                            >
                              {isRunning ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Sparkles className="h-4 w-4" />}
                              Search
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openInteractiveSearch(item)}>
                              Interactive Search
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleSearchUpgrade(item)}>
                              Trigger Search
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleCheckUpgrade(item)}>
                              Recheck 4K
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <InteractiveSearchModal
        open={!!activeItem}
        item={activeItem}
        releases={interactiveReleases}
        isLoading={isLoadingReleases}
        filter={releaseFilter}
        onFilterChange={setReleaseFilter}
        onClose={closeInteractiveSearch}
        onRefresh={() => (activeItem ? loadInteractiveReleases(activeItem) : undefined)}
        onGrab={handleGrabRelease}
        grabbingGuid={grabbingGuid}
      />
    </div>
  );
}
