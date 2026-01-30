"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCcw, Search, Sparkles, ChevronDown, X, Loader2, Download, Cloud } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import type { UpgradeFinderItem } from "@/lib/upgrade-finder";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { useIsIOS } from "@/hooks/useIsApple";

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
    bg: "bg-orange-500/15",
    text: "text-orange-200",
    border: "border-orange-500/40"
  },
  none: {
    label: "No 4K found",
    bg: "bg-white/5",
    text: "text-white/60",
    border: "border-white/10"
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
  year?: number | null;
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
  const isIOS = useIsIOS();
  useLockBodyScroll(open, isIOS === true);

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
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200 touch-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Interactive Search"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-6xl h-[92vh] sm:h-[90vh] flex flex-col bg-slate-950 rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 overflow-hidden touch-auto"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* Header with backdrop */}
        <div className="flex-shrink-0 relative overflow-hidden">
          {/* Backdrop image */}
          {item.backdropUrl && (
            <div className="absolute inset-0">
              <Image
                src={item.backdropUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 1200px"
                className="object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/80 to-slate-950" />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-transparent to-slate-950/90" />
            </div>
          )}
          {!item.backdropUrl && (
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-slate-950" />
          )}

          <div className="relative p-5 sm:p-6">
            {/* Mobile handle */}
            <div className="sm:hidden flex justify-center mb-4">
              <div className="w-12 h-1.5 rounded-full bg-white/30" />
            </div>

            {/* Title row */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                {/* Poster thumbnail */}
                {item.posterUrl && (
                  <div className="hidden sm:block flex-shrink-0 w-16 h-24 rounded-xl overflow-hidden ring-2 ring-white/20 shadow-xl relative">
                    <Image
                      src={item.posterUrl}
                      alt={item.title}
                      width={64}
                      height={96}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-orange-400 font-semibold uppercase tracking-widest mb-1">Interactive Search</p>
                  <h2 className="text-xl sm:text-2xl font-bold text-white truncate drop-shadow-lg">{item.title}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 backdrop-blur-sm">
                      {item.mediaType === "movie" ? "🎬" : "📺"} {item.mediaType}
                    </span>
                    {item.year && <span className="text-sm text-white/70 font-medium">{item.year}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 hover:bg-white/20 hover:text-white disabled:opacity-50 transition-all duration-300"
                >
                  <RefreshCcw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stats pills */}
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
                <span className="text-white/80 text-sm">Results</span>
                <span className="font-bold text-white">{releases.length}</span>
              </div>
              {count4k > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/20 backdrop-blur-sm border border-orange-500/30">
                  <span className="text-orange-200/80 text-sm">4K</span>
                  <span className="font-bold text-orange-200">{count4k}</span>
                </div>
              )}
              {count1080p > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/20 backdrop-blur-sm border border-sky-500/30">
                  <span className="text-sky-200/80 text-sm">1080p</span>
                  <span className="font-bold text-sky-200">{count1080p}</span>
                </div>
              )}
            </div>

            {/* Search and filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div
                className="relative flex-1"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                <input
                  value={releaseSearch}
                  onChange={(event) => setReleaseSearch(event.target.value)}
                  placeholder="Search releases..."
                  className="w-full h-11 rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {filterButtons.map((btn) => (
                  <button
                    key={btn.value}
                    type="button"
                    onClick={() => onFilterChange(btn.value)}
                    className={cn(
                      "flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-300 backdrop-blur-sm",
                      filter === btn.value
                        ? "bg-orange-500/30 text-orange-100 border border-orange-500/40"
                        : "bg-white/10 text-white/60 border border-white/20 hover:text-white hover:bg-white/20"
                    )}
                  >
                    {btn.shortLabel || btn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto overflow-x-auto"
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
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mb-6 border border-white/10">
                <Loader2 className="w-8 h-8 text-orange-300 animate-spin" />
              </div>
              <p className="text-lg font-bold text-white mb-1">Searching releases...</p>
              <p className="text-sm text-white/50">This may take a moment</p>
            </div>
          ) : filtered.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center mb-6 border border-white/10">
                <Search className="w-8 h-8 text-white/30" />
              </div>
              <p className="text-lg font-bold text-white mb-1">No releases found</p>
              <p className="text-sm text-white/50 text-center max-w-xs">
                {filter !== "all"
                  ? "Try selecting a different quality filter"
                  : "Try refreshing or check back later"}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <th className="p-4 pl-6 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Release</th>
                      <th className="p-4 text-center text-xs font-bold text-white/50 uppercase tracking-wider w-20">Size</th>
                      <th className="p-4 text-center text-xs font-bold text-white/50 uppercase tracking-wider w-16">Age</th>
                      <th className="p-4 pr-6 text-right text-xs font-bold text-white/50 uppercase tracking-wider w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((release, index) => {
                      const rowKey = release.guid || `${release.indexerId ?? "x"}-${release.title}`;
                      const is4k = release.title.toLowerCase().includes("4k") ||
                                   release.title.toLowerCase().includes("2160") ||
                                   release.quality.toLowerCase().includes("4k") ||
                                   release.quality.toLowerCase().includes("2160");
                      const displayTitle = release.year ? `${release.title} (${release.year})` : release.title;
                      const historyDisplay = getHistoryDisplay(release.history);

                      return (
                        <tr
                          key={rowKey}
                          className="group border-b border-white/5 last:border-b-0 hover:bg-gradient-to-r hover:from-orange-500/5 hover:to-amber-500/5 transition-all duration-300"
                          style={{ animationDelay: `${index * 20}ms` }}
                        >
                          <td className="p-4 pl-6">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold uppercase shadow-lg group-hover:shadow-xl transition-all duration-300",
                                release.protocol === "torrent"
                                  ? "bg-gradient-to-br from-orange-500/20 to-orange-600/20 text-orange-300 ring-1 ring-orange-500/30 group-hover:ring-orange-500/50"
                                  : "bg-gradient-to-br from-sky-500/20 to-sky-600/20 text-sky-300 ring-1 ring-sky-500/30 group-hover:ring-sky-500/50"
                              )}>
                                {release.protocol === "torrent" ? "TOR" : "NZB"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn(
                                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border",
                                    is4k
                                      ? "bg-orange-500/20 text-orange-200 border-orange-500/30"
                                      : "bg-white/10 text-white/60 border-white/10"
                                  )}>
                                    {release.quality || "—"}
                                  </span>
                                  {historyDisplay.isImport && (
                                    <span title="Previously imported" className="flex items-center gap-1 text-[10px] text-sky-400">
                                      <Cloud className="h-3.5 w-3.5" />
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    "font-semibold text-sm leading-tight line-clamp-1 group-hover:text-orange-100 transition-colors",
                                    is4k ? "text-orange-200" : "text-white"
                                  )}
                                  title={displayTitle}
                                >
                                  {displayTitle}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-white/40">
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
                          <td className="p-4 text-center">
                            <span className="text-white/70 font-semibold text-sm">
                              {formatBytes(release.size ?? undefined)}
                            </span>
                          </td>
                          <td className="p-4 text-center text-white/60 text-sm">
                            {formatAge(release.age)}
                          </td>
                          <td className="p-4 pr-6 text-right">
                            <button
                              type="button"
                              disabled={grabbingGuid === release.guid}
                              onClick={() => onGrab(release)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300",
                                grabbingGuid === release.guid
                                  ? "bg-white/10 text-white/50 cursor-not-allowed"
                                  : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30 hover:ring-emerald-500/50 hover:scale-105 active:scale-95"
                              )}
                            >
                              {grabbingGuid === release.guid ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
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
              <div className="md:hidden p-4 space-y-3">
                {filtered.map((release, index) => {
                  const rowKey = release.guid || `${release.indexerId ?? "x"}-${release.title}`;
                  const is4k = release.title.toLowerCase().includes("4k") ||
                               release.title.toLowerCase().includes("2160") ||
                               release.quality.toLowerCase().includes("4k") ||
                               release.quality.toLowerCase().includes("2160");
                  const displayTitle = release.year ? `${release.title} (${release.year})` : release.title;
                  const historyDisplay = getHistoryDisplay(release.history);

                  return (
                    <div
                      key={rowKey}
                      className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/10"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Gradient accent on hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/0 to-amber-500/0 group-hover:from-orange-500/5 group-hover:to-amber-500/5 transition-all duration-500" />

                      <div className="relative p-4">
                        {/* Header row with protocol badge and quality */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border",
                            release.protocol === "torrent"
                              ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                              : "bg-sky-500/20 text-sky-300 border-sky-500/30"
                          )}>
                            {release.protocol === "torrent" ? "TOR" : "NZB"}
                          </span>
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold border",
                            is4k
                              ? "bg-orange-500/20 text-orange-200 border-orange-500/30"
                              : "bg-white/10 text-white/60 border-white/10"
                          )}>
                            {release.quality || "—"}
                          </span>
                          {historyDisplay.isImport && (
                            <Cloud className="h-4 w-4 text-sky-400" />
                          )}
                        </div>

                        {/* Title */}
                        <div className={cn(
                          "font-semibold text-base leading-snug mb-3 group-hover:text-orange-100 transition-colors",
                          is4k ? "text-orange-200" : "text-white"
                        )}>
                          {displayTitle}
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 mb-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white/40">Size:</span>
                            <span className="font-semibold text-white/80">{formatBytes(release.size ?? undefined)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-white/40">Age:</span>
                            <span className="font-medium text-white/80">{formatAge(release.age)}</span>
                          </div>
                        </div>

                        {/* Footer with indexer and grab */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-white/50 truncate">
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
                              "flex-shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300",
                              grabbingGuid === release.guid
                                ? "bg-white/10 text-white/50 cursor-not-allowed"
                                : "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30 hover:ring-emerald-500/50 active:scale-95"
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
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-5 py-4 text-sm">
          <div className="text-white/50">
            {filtered.length} of {releases.length} shown
            {filter !== "all" && <span className="text-white/30"> • {filter} filter</span>}
          </div>
          {isLoadingMore ? (
            <div className="flex items-center gap-2 text-orange-300 font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
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
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-4 shadow-lg">
          <div className="text-xs font-medium text-white/60 uppercase tracking-wider">Total</div>
          <div className="text-2xl font-bold text-white mt-1">{items.length}</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-amber-400 uppercase tracking-wider">Upgrades</div>
          <div className="text-2xl font-bold text-white mt-1">{upgradeCount}</div>
        </div>
        <div className="rounded-xl border border-slate-500/20 bg-gradient-to-br from-slate-500/10 to-slate-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Missing</div>
          <div className="text-2xl font-bold text-white mt-1">{missingCount}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 shadow-lg">
          <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Complete</div>
          <div className="text-2xl font-bold text-white mt-1">{upToDateCount}</div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn btn-primary"
        >
          <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search movies..."
            className="w-full h-10 rounded-lg border border-white/10 bg-slate-900/60 py-2 pl-4 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap items-center gap-1.5 pb-1 sm:pb-0 sm:justify-end">
          {statusFilterButtons.map((btn) => (
            <button
              key={btn.value}
              type="button"
              onClick={() => setStatusFilter(btn.value)}
              className={cn(
                "flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                statusFilter === btn.value
                  ? "bg-indigo-600 text-white"
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
      <div className="hidden md:block rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden shadow-lg shadow-black/10">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr className="bg-white/5">
              <th className="p-4 pl-6 text-left font-semibold">Media</th>
              <th className="p-4 text-left font-semibold w-28">Quality</th>
              <th className="p-4 text-left font-semibold w-32">Status</th>
              <th className="p-4 text-left font-semibold w-28">4K Hint</th>
              <th className="p-4 pr-6 text-right font-semibold w-28"></th>
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
                  <tr key={`${item.mediaType}-${item.id}`} className="hover:bg-white/5 transition-colors group">
                    <td className="p-3 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-14 rounded overflow-hidden bg-black/20 shadow-sm border border-white/5 flex items-center justify-center">
                          {item.posterUrl ? (
                            <Image
                              src={item.posterUrl}
                              alt={item.title}
                              width={40}
                              height={56}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-lg">🎬</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{item.title}</div>
                          <div className="text-xs text-muted">
                            {item.mediaType === "movie" ? "Movie" : "Series"}
                            {item.year ? ` • ${item.year}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-semibold text-white/90">{item.currentQuality || "—"}</div>
                      <div className="text-xs text-muted">{formatBytes(item.currentSizeBytes)}</div>
                    </td>
                    <td className="p-4">
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", status.bg, status.text, "ring-1", status.border.replace("border-", "ring-"))}>
                        {shouldShowUpgrade ? "Upgrade" : status.label}
                      </span>
                      {item.ignore4k && (
                        <div className="mt-1 text-[10px] text-white/30">4K ignored</div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", hintStyle.bg, hintStyle.text, "ring-1", hintStyle.border.replace("border-", "ring-"))}>
                        {hintStyle.label}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={isRunning}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors",
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
      <div className="md:hidden space-y-4">
        {filteredItems.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-slate-900/60 p-8 text-center">
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
                className="rounded-lg border border-white/10 bg-slate-900/60 p-4 space-y-3"
              >
                {/* Header with title and status badges */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-12 h-16 rounded overflow-hidden bg-black/20 shadow-sm border border-white/5 flex items-center justify-center relative">
                    {item.posterUrl ? (
                      <Image
                        src={item.posterUrl}
                        alt={item.title}
                        width={48}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xl">🎬</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white leading-tight">{item.title}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {item.mediaType === "movie" ? "Movie" : "Series"}
                      {item.year ? ` • ${item.year}` : ""}
                    </div>
                  </div>
                </div>

                {/* Status badges row */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold", status.bg, status.text, "ring-1", status.border.replace("border-", "ring-"))}>
                    {shouldShowUpgrade ? "Upgrade" : status.label}
                  </span>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold", hintStyle.bg, hintStyle.text, "ring-1", hintStyle.border.replace("border-", "ring-"))}>
                    {hintStyle.label}
                  </span>
                  {item.ignore4k && (
                    <span className="text-[10px] text-white/30">4K ignored</span>
                  )}
                </div>

                {/* Quality info */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted">Current:</span>
                    <span className="font-semibold text-white/80">{item.currentQuality || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted">Size:</span>
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
                        "w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors",
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
