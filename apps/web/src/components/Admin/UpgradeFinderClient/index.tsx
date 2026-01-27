"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCcw, Search, Sparkles, ChevronDown, X, Loader2, Download, Cloud } from "lucide-react";
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
  infoUrl: string;
  size: number | null;
  age: number | null;
  seeders: number | null;
  leechers: number | null;
  quality: string;
  language: string;
  rejected: string[];
  history?: Array<{ date: string | null; eventType: string | number | null; source: string | null }>;
};
type ReleaseFilter = "all" | "4k" | "1080p" | "720p" | "480p" | "telesync" | "cam";

function matchesReleaseFilter(release: ReleaseRow, filter: ReleaseFilter) {
  if (filter === "all") return true;
  const title = release.title.toLowerCase();
  const quality = release.quality.toLowerCase();
  const combined = `${title} ${quality}`;
  if (filter === "4k") return combined.includes("4k") || combined.includes("2160");
  if (filter === "1080p") return combined.includes("1080");
  if (filter === "720p") return combined.includes("720");
  if (filter === "480p") return combined.includes("480");
  if (filter === "telesync") return combined.includes("telesync") || /\bts\b/.test(combined);
  if (filter === "cam") return combined.includes("cam") || /\bhdcam\b/.test(combined);
  return true;
}


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

function formatHistoryLabel(history?: Array<{ date: string | null; eventType: string | number | null; source: string | null }>) {
  if (!history || history.length === 0) return "—";
  const latest = history[0];
  const raw = String(latest?.eventType ?? "");
  const event = raw ? raw.replace(/([a-z])([A-Z])/g, "$1 $2") : "Activity";
  const source = latest?.source ? ` • ${latest.source}` : "";
  return `${event}${source}`;
}

function getHistoryDisplay(history?: Array<{ date: string | null; eventType: string | number | null; source: string | null }>) {
  if (!history || history.length === 0) return { text: "—", isImport: false };
  const latest = history[0];
  const raw = String(latest?.eventType ?? "");
  const lower = raw.toLowerCase();
  const isImport = lower.includes("downloadfolder");
  const base = raw ? raw.replace(/([a-z])([A-Z])/g, "$1 $2") : "Activity";
  const label = isImport ? "Imported" : base;
  const source = latest?.source ? ` • ${latest.source}` : "";
  return { text: `${label}${source}`, isImport };
}

function itemKey(item: Pick<UpgradeFinderItem, "mediaType" | "id">) {
  return `${item.mediaType}:${item.id}`;
}

function InteractiveSearchModal(props: {
  open: boolean;
  item: UpgradeFinderItem | null;
  releases: ReleaseRow[];
  isLoading: boolean;
  filter: ReleaseFilter;
  onFilterChange: (value: ReleaseFilter) => void;
  onClose: () => void;
  onRefresh: () => void;
  onGrab: (release: ReleaseRow) => void;
  grabbingGuid: string | null;
  onLoadMore: () => void;
  total: number;
}) {
  const { open, item, releases, isLoading, filter, onFilterChange, onClose, onRefresh, onGrab, grabbingGuid, onLoadMore, total } = props;
  const [releaseSearch, setReleaseSearch] = useState("");
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

  const query = releaseSearch.trim().toLowerCase();
  const filtered = releases
    .filter(release => matchesReleaseFilter(release, filter))
    .filter(release => (query ? release.title.toLowerCase().includes(query) : true));
  const isLoadingMore = isLoading && releases.length > 0;
  const canLoadMore = query.length > 0;

  // Count by quality for quick stats
  const count4k = releases.filter(r => r.title.toLowerCase().includes("4k") || r.title.toLowerCase().includes("2160")).length;
  const count1080p = releases.filter(r => r.title.toLowerCase().includes("1080") && !r.title.toLowerCase().includes("4k")).length;

  const filterButtons: { value: ReleaseFilter; label: string; shortLabel?: string }[] = [
    { value: "all", label: "All" },
    { value: "4k", label: "4K" },
    { value: "1080p", label: "1080p" },
    { value: "720p", label: "720p" },
    { value: "480p", label: "480p" },
    { value: "telesync", label: "TS", shortLabel: "TS" },
    { value: "cam", label: "CAM" },
  ];

  const modal = (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/80 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Interactive Search"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-5xl h-[92vh] sm:h-[85vh] flex flex-col bg-slate-950 sm:rounded-xl border-t sm:border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-white/10 bg-slate-900/70">
          {/* Mobile handle */}
          <div className="sm:hidden flex justify-center mb-3">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Title row */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-white truncate">{item.title}</h2>
              <div className="text-xs text-white/50">{item.year || "Unknown"} • {item.mediaType}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <RefreshCcw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2 text-xs mb-3">
            <span className="text-white/50">{releases.length} results</span>
            {count4k > 0 && <span className="text-violet-400">• {count4k} 4K</span>}
            {count1080p > 0 && <span className="text-sky-400">• {count1080p} 1080p</span>}
          </div>

          {/* Search and filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                value={releaseSearch}
                onChange={(event) => setReleaseSearch(event.target.value)}
                placeholder="Search releases..."
                className="w-full h-9 rounded-lg border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {filterButtons.map((btn) => (
                <button
                  key={btn.value}
                  type="button"
                  onClick={() => onFilterChange(btn.value)}
                  className={cn(
                    "flex-shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    filter === btn.value
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                  )}
                >
                  {btn.shortLabel || btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onScroll={(event) => {
            const target = event.currentTarget;
            if (!canLoadMore) return;
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 200) {
              onLoadMore();
            }
          }}
        >
          {/* Loading state */}
          {isLoading && releases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-white">Searching releases...</p>
              <p className="mt-1 text-xs text-white/50">This may take a moment</p>
            </div>
          ) : filtered.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-sm font-medium text-white">No releases found</p>
              <p className="mt-1 text-xs text-white/50 text-center max-w-xs">
                {filter !== "all"
                  ? "Try selecting a different quality filter"
                  : "Try refreshing or check back later"}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden md:block">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="border-b border-white/10 bg-slate-900/80 sticky top-0 z-10">
                    <tr className="text-[10px] uppercase tracking-wider text-white/40">
                      <th className="px-4 py-3 font-semibold">Release</th>
                      <th className="px-3 py-3 font-semibold text-center w-16">Size</th>
                      <th className="px-3 py-3 font-semibold text-center w-14">Age</th>
                      <th className="px-3 py-3 font-semibold text-center w-16">Peers</th>
                      <th className="px-4 py-3 font-semibold text-right w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map((release) => {
                      const rowKey = release.guid || `${release.indexerId ?? "x"}-${release.title}`;
                      const is4k = release.title.toLowerCase().includes("4k") ||
                                   release.title.toLowerCase().includes("2160") ||
                                   release.quality.toLowerCase().includes("4k") ||
                                   release.quality.toLowerCase().includes("2160");
                      const historyDisplay = getHistoryDisplay(release.history);

                      return (
                        <tr key={rowKey} className="group hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase",
                                release.protocol === "torrent"
                                  ? "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30"
                                  : "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30"
                              )}>
                                {release.protocol === "torrent" ? "TOR" : "NZB"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={cn(
                                    "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold",
                                    is4k
                                      ? "bg-violet-500/25 text-violet-200"
                                      : "bg-white/10 text-white/60"
                                  )}>
                                    {release.quality || "—"}
                                  </span>
                                  {historyDisplay.isImport && (
                                    <span title="Previously imported">
                                      <Cloud className="h-3.5 w-3.5 text-sky-400" />
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    "font-medium text-sm leading-tight line-clamp-1",
                                    is4k ? "text-violet-200" : "text-white"
                                  )}
                                  title={release.title}
                                >
                                  {release.title}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/40">
                                  {release.infoUrl ? (
                                    <a
                                      href={release.infoUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sky-300/70 hover:text-sky-300 transition-colors"
                                    >
                                      {release.indexer || "Indexer"}
                                    </a>
                                  ) : (
                                    <span>{release.indexer || "—"}</span>
                                  )}
                                  {release.language && release.language !== "—" && (
                                    <>
                                      <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
                                      <span>{release.language}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-white/70 font-medium text-xs">
                              {formatBytes(release.size ?? undefined)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center text-white/60 text-xs">
                            {formatAge(release.age)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="inline-flex items-center gap-1 text-xs">
                              <span className="text-emerald-400 font-semibold">{release.seeders ?? "—"}</span>
                              <span className="text-white/30">/</span>
                              <span className="text-rose-400">{release.leechers ?? "—"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={grabbingGuid === release.guid}
                              onClick={() => onGrab(release)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                                grabbingGuid === release.guid
                                  ? "bg-white/10 text-white/50 cursor-not-allowed"
                                  : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30 active:scale-95"
                              )}
                            >
                              {grabbingGuid === release.guid ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              <span>{grabbingGuid === release.guid ? "..." : "Grab"}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden divide-y divide-white/5">
                {filtered.map((release) => {
                  const rowKey = release.guid || `${release.indexerId ?? "x"}-${release.title}`;
                  const is4k = release.title.toLowerCase().includes("4k") ||
                               release.title.toLowerCase().includes("2160") ||
                               release.quality.toLowerCase().includes("4k") ||
                               release.quality.toLowerCase().includes("2160");
                  const historyDisplay = getHistoryDisplay(release.history);

                  return (
                    <div key={rowKey} className="p-4 active:bg-white/5 transition-colors">
                      {/* Header row with protocol badge and quality */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                          release.protocol === "torrent"
                            ? "bg-violet-500/20 text-violet-300"
                            : "bg-sky-500/20 text-sky-300"
                        )}>
                          {release.protocol === "torrent" ? "TOR" : "NZB"}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold",
                          is4k
                            ? "bg-violet-500/25 text-violet-200"
                            : "bg-white/10 text-white/60"
                        )}>
                          {release.quality || "—"}
                        </span>
                        {historyDisplay.isImport && (
                          <Cloud className="h-4 w-4 text-sky-400" />
                        )}
                      </div>

                      {/* Title */}
                      <div className={cn(
                        "font-medium text-sm leading-snug mb-3",
                        is4k ? "text-violet-200" : "text-white"
                      )}>
                        {release.title}
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 mb-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/40">Size:</span>
                          <span className="font-medium text-white/80">{formatBytes(release.size ?? undefined)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/40">Age:</span>
                          <span className="font-medium text-white/80">{formatAge(release.age)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-emerald-400 font-semibold">{release.seeders ?? "—"}</span>
                          <span className="text-white/30">/</span>
                          <span className="text-rose-400">{release.leechers ?? "—"}</span>
                        </div>
                      </div>

                      {/* Footer with indexer and grab */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-white/50 truncate">
                          {release.infoUrl ? (
                            <a
                              href={release.infoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-300/70 hover:text-sky-300"
                            >
                              {release.indexer || "Indexer"}
                            </a>
                          ) : (
                            release.indexer || "—"
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={grabbingGuid === release.guid}
                          onClick={() => onGrab(release)}
                          className={cn(
                            "flex-shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                            grabbingGuid === release.guid
                              ? "bg-white/10 text-white/50 cursor-not-allowed"
                              : "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30 active:scale-95"
                          )}
                        >
                          {grabbingGuid === release.guid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          <span>{grabbingGuid === release.guid ? "..." : "Grab"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between border-t border-white/10 bg-slate-900/50 px-4 py-3 text-xs">
          <div className="text-white/50">
            {filtered.length} of {releases.length} shown
            {filter !== "all" && <span className="text-white/30"> • {filter} filter active</span>}
          </div>
          {isLoadingMore ? (
            <div className="flex items-center gap-2 text-indigo-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading more...
            </div>
          ) : total > 0 && releases.length < total ? (
            <div className="text-white/40">{canLoadMore ? "Scroll to load more" : "Search to load more"}</div>
          ) : null}
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
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>("all");
  const [releaseTotal, setReleaseTotal] = useState(0);
  const [releaseOffset, setReleaseOffset] = useState(0);
  const [grabbingGuid, setGrabbingGuid] = useState<string | null>(null);
  const releaseCacheRef = useRef<Record<string, { items: ReleaseRow[]; total: number }>>({});

  const filteredItems = useMemo(() => {
    const statusOrder: Record<UpgradeFinderItem["upgradeStatus"], number> = {
      upgrade: 0,
      missing: 1,
      partial: 2,
      "up-to-date": 3
    };

    return items
      .filter(item => (typeFilter === "all" ? true : item.mediaType === typeFilter))
      .filter(item => {
        if (statusFilter === "all") return true;
        // For "upgrade" filter, include items that either have upgradeStatus="upgrade"
        // OR have a 4K hint available (not ignored)
        if (statusFilter === "upgrade") {
          const hint = hintMap[itemKey(item)];
          const has4kHint = hint?.status === "available" && !item.ignore4k;
          return item.upgradeStatus === "upgrade" || has4kHint;
        }
        return item.upgradeStatus === statusFilter;
      })
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
  }, [items, searchQuery, typeFilter, statusFilter, hintMap]);

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

  const loadInteractiveReleases = async (item: UpgradeFinderItem, options?: { offset?: number; append?: boolean; force?: boolean }) => {
    const offset = options?.offset ?? 0;
    const append = options?.append ?? false;
    const force = options?.force ?? false;
    if (isLoadingReleases) return;
    const cacheKey = `${item.mediaType}:${item.id}`;
    const cached = releaseCacheRef.current[cacheKey];
    if (!force && offset === 0 && cached) {
      setInteractiveReleases(cached.items);
      setReleaseTotal(cached.total);
      setReleaseOffset(cached.items.length);
      return;
    }
    setIsLoadingReleases(true);
    try {
      const params = new URLSearchParams({
        mediaType: item.mediaType,
        id: String(item.id),
        offset: String(offset),
        limit: "50"
      });
      const res = await fetch(`/api/v1/admin/upgrade-finder/releases?${params.toString()}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load releases");
      const items = Array.isArray(body?.items) ? body.items : [];
      setInteractiveReleases((prev: ReleaseRow[]) => {
        if (!append) return items;
        const existing = new Set(prev.map((entry: ReleaseRow) => entry.guid || `${entry.indexerId ?? "x"}-${entry.title}`));
        const merged = items.filter((entry: ReleaseRow) => {
          const key = entry.guid || `${entry.indexerId ?? "x"}-${entry.title}`;
          return !existing.has(key);
        });
        return [...prev, ...merged];
      });
      setReleaseTotal(Number(body?.total ?? 0));
      setReleaseOffset(offset + items.length);
      if (offset === 0 && !append) {
        releaseCacheRef.current[cacheKey] = { items, total: Number(body?.total ?? 0) };
      } else {
        const updated = releaseCacheRef.current[cacheKey];
        if (updated) {
          releaseCacheRef.current[cacheKey] = {
            items: append ? [...updated.items, ...items] : items,
            total: Number(body?.total ?? 0)
          };
        }
      }
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
    setReleaseTotal(0);
    setReleaseOffset(0);
    await loadInteractiveReleases(item, { offset: 0 });
  };

  const closeInteractiveSearch = () => {
    setActiveItem(null);
    setInteractiveReleases([]);
    setReleaseTotal(0);
    setReleaseOffset(0);
    setGrabbingGuid(null);
  };

  const handleLoadMore = () => {
    if (!activeItem) return;
    if (isLoadingReleases) return;
    if (releaseTotal === 0 && interactiveReleases.length === 0) return;
    if (releaseOffset >= releaseTotal && releaseTotal !== 0) return;
    void loadInteractiveReleases(activeItem, { offset: releaseOffset, append: true });
  };

  const handleIgnoreUpgrade = async (item: UpgradeFinderItem, ignore: boolean) => {
    try {
      const res = await csrfFetch("/api/v1/admin/upgrade-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: item.mediaType, id: item.id, mode: "ignore", ignore4k: ignore })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to update ignore flag");
      setItems(prev => prev.map(entry => (entry.id === item.id && entry.mediaType === item.mediaType ? { ...entry, ignore4k: ignore } : entry)));
      toast.success(ignore ? "4K upgrade ignored" : "4K upgrade restored", { timeoutMs: 2500 });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update ignore flag");
    }
  };

  const handleGrabRelease = async (release: ReleaseRow) => {
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
          title: release.title,
          protocol: release.protocol
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


  // Stats for the header
  const upgradeCount = items.filter(i => i.upgradeStatus === "upgrade" || (hintMap[itemKey(i)]?.status === "available" && !i.ignore4k)).length;
  const missingCount = items.filter(i => i.upgradeStatus === "missing").length;
  const upToDateCount = items.filter(i => i.upgradeStatus === "up-to-date").length;

  const statusFilterButtons: { value: "all" | UpgradeFinderItem["upgradeStatus"]; label: string; count?: number }[] = [
    { value: "all", label: "All", count: items.length },
    { value: "upgrade", label: "Upgrades", count: upgradeCount },
    { value: "missing", label: "Missing", count: missingCount },
    { value: "up-to-date", label: "Complete", count: upToDateCount },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-6">
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 ring-1 ring-white/10">
                <Sparkles className="w-6 h-6 text-white/60" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">Upgrade Finder</h1>
                <p className="text-sm text-white/50">Find quality upgrades for your library</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              Refresh
            </button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-black/20 border border-white/10 p-3 text-center">
              <div className="text-2xl font-bold text-white">{items.length}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Total</div>
            </div>
            <div className="rounded-xl bg-black/20 border border-white/10 p-3 text-center">
              <div className="text-2xl font-bold text-white">{upgradeCount}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Upgrades</div>
            </div>
            <div className="rounded-xl bg-black/20 border border-white/10 p-3 text-center">
              <div className="text-2xl font-bold text-white">{missingCount}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Missing</div>
            </div>
            <div className="rounded-xl bg-black/20 border border-white/10 p-3 text-center">
              <div className="text-2xl font-bold text-white">{upToDateCount}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Complete</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search movies..."
            className="w-full h-10 rounded-xl border border-white/10 bg-slate-900/60 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {statusFilterButtons.map((btn) => (
            <button
              key={btn.value}
              type="button"
              onClick={() => setStatusFilter(btn.value)}
              className={cn(
                "flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                statusFilter === btn.value
                  ? "bg-white/10 text-white border border-white/20"
                  : "bg-slate-900/60 text-white/60 hover:bg-slate-800 hover:text-white border border-white/10"
              )}
            >
              {btn.label}
              {btn.count !== undefined && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px]",
                  statusFilter === btn.value ? "bg-white/20" : "bg-white/10"
                )}>
                  {btn.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-black/20">
            <tr className="text-[10px] uppercase tracking-wider text-white/40">
              <th className="px-5 py-3.5 font-semibold">Media</th>
              <th className="px-4 py-3.5 font-semibold w-28">Quality</th>
              <th className="px-4 py-3.5 font-semibold w-32">Status</th>
              <th className="px-4 py-3.5 font-semibold w-28">4K Hint</th>
              <th className="px-5 py-3.5 font-semibold w-28 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center">
                  <div className="text-white/20 text-4xl mb-3">🎬</div>
                  <div className="text-sm text-white/50">No movies found</div>
                  <div className="text-xs text-white/30 mt-1">Try adjusting your filters</div>
                </td>
              </tr>
            ) : (
              filteredItems.map(item => {
                const key = itemKey(item);
                const hintState = hintMap[key] ?? { status: "idle" as HintStatus };
                const shouldShowUpgrade = hintState.status === "available" && !item.ignore4k;
                const status = statusStyles[shouldShowUpgrade ? "upgrade" : item.upgradeStatus];
                const isRunning = runningIds.has(key);
                const displayHintStatus = item.ignore4k && hintState.status === "available" ? "none" : hintState.status;
                const hintStyle = hintStyles[displayHintStatus];
                return (
                  <tr key={`${item.mediaType}-${item.id}`} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-lg">
                          🎬
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">{item.title}</div>
                          <div className="text-xs text-white/40">
                            {item.mediaType === "movie" ? "Movie" : "Series"}
                            {item.year ? ` • ${item.year}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-semibold text-white/90">{item.currentQuality || "—"}</div>
                      <div className="text-xs text-white/40">{formatBytes(item.currentSizeBytes)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold", status.bg, status.text, "ring-1", status.border.replace("border-", "ring-"))}>
                        {shouldShowUpgrade ? "Upgrade" : status.label}
                      </span>
                      {item.ignore4k && (
                        <div className="mt-1 text-[10px] text-white/30">4K ignored</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold", hintStyle.bg, hintStyle.text, "ring-1", hintStyle.border.replace("border-", "ring-"))}>
                        {hintStyle.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={isRunning}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 transition-all",
                              isRunning && "opacity-70"
                            )}
                          >
                            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            Search
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-slate-950/95 border border-white/10 shadow-xl"
                        >
                          <DropdownMenuItem onSelect={() => openInteractiveSearch(item)}>
                            Interactive Search
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleSearchUpgrade(item)}>
                            Trigger Search
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleCheckUpgrade(item)}>
                            Recheck 4K
                          </DropdownMenuItem>
                          {hintState.status === "available" && (
                            <DropdownMenuItem onSelect={() => handleIgnoreUpgrade(item, !item.ignore4k)}>
                              {item.ignore4k ? "Restore 4K" : "Ignore 4K"}
                            </DropdownMenuItem>
                          )}
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

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center">
            <div className="text-white/20 text-4xl mb-3">🎬</div>
            <div className="text-sm text-white/50">No movies found</div>
            <div className="text-xs text-white/30 mt-1">Try adjusting your filters</div>
          </div>
        ) : (
          filteredItems.map(item => {
            const key = itemKey(item);
            const hintState = hintMap[key] ?? { status: "idle" as HintStatus };
            const shouldShowUpgrade = hintState.status === "available" && !item.ignore4k;
            const status = statusStyles[shouldShowUpgrade ? "upgrade" : item.upgradeStatus];
            const isRunning = runningIds.has(key);
            const displayHintStatus = item.ignore4k && hintState.status === "available" ? "none" : hintState.status;
            const hintStyle = hintStyles[displayHintStatus];

            return (
              <div
                key={`mobile-${item.mediaType}-${item.id}`}
                className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 active:bg-slate-900/80 transition-colors"
              >
                {/* Header with title and status badges */}
                <div className="flex items-start gap-3 mb-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-xl">
                      🎬
                    </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white leading-tight">{item.title}</div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {item.mediaType === "movie" ? "Movie" : "Series"}
                      {item.year ? ` • ${item.year}` : ""}
                    </div>
                  </div>
                </div>

                {/* Status badges row */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={cn("inline-flex items-center rounded-lg px-2 py-1 text-[10px] font-semibold", status.bg, status.text, "ring-1", status.border.replace("border-", "ring-"))}>
                    {shouldShowUpgrade ? "Upgrade" : status.label}
                  </span>
                  <span className={cn("inline-flex items-center rounded-lg px-2 py-1 text-[10px] font-semibold", hintStyle.bg, hintStyle.text, "ring-1", hintStyle.border.replace("border-", "ring-"))}>
                    {hintStyle.label}
                  </span>
                  {item.ignore4k && (
                    <span className="text-[10px] text-white/30">4K ignored</span>
                  )}
                </div>

                {/* Quality info */}
                <div className="flex items-center gap-4 mb-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/40">Current:</span>
                    <span className="font-semibold text-white/80">{item.currentQuality || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/40">Size:</span>
                    <span className="font-medium text-white/70">{formatBytes(item.currentSizeBytes)}</span>
                  </div>
                </div>

                {/* Action button */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={isRunning}
                    className={cn(
                      "w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-all",
                      isRunning && "opacity-70"
                    )}
                    >
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Search for Upgrades
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    className="bg-slate-950/95 border border-white/10 shadow-xl w-56"
                  >
                    <DropdownMenuItem onSelect={() => openInteractiveSearch(item)}>
                      Interactive Search
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleSearchUpgrade(item)}>
                      Trigger Search
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleCheckUpgrade(item)}>
                      Recheck 4K
                    </DropdownMenuItem>
                    {hintState.status === "available" && (
                      <DropdownMenuItem onSelect={() => handleIgnoreUpgrade(item, !item.ignore4k)}>
                        {item.ignore4k ? "Restore 4K" : "Ignore 4K"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}
      </div>

      <InteractiveSearchModal
        open={!!activeItem}
        item={activeItem}
        releases={interactiveReleases}
        isLoading={isLoadingReleases}
        filter={releaseFilter}
        onFilterChange={setReleaseFilter}
        onClose={closeInteractiveSearch}
        onRefresh={() => (activeItem ? loadInteractiveReleases(activeItem, { offset: 0, force: true }) : undefined)}
        onGrab={handleGrabRelease}
        grabbingGuid={grabbingGuid}
        onLoadMore={handleLoadMore}
        total={releaseTotal}
      />
    </div>
  );
}
