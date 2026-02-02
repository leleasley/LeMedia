"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCcw, Search, X, Loader2, Download, Cloud, Check } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { useIsIOS } from "@/hooks/useIsApple";
import { Modal } from "@/components/Common/Modal";

const PAGE_SIZE = 50;

type ReleaseRow = {
  guid: string;
  downloadUrl?: string | null;
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
  if (!bytes || Number.isNaN(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatAge(days?: number | null) {
  if (days === null || days === undefined || Number.isNaN(days)) return "-";
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${Math.round(days)}d`;
}

function getHistoryDisplay(history?: Array<{ date: string | null; eventType: string | number | null; source: string | null }>) {
  if (!history || history.length === 0) return { text: "-", isImport: false };
  const latest = history[0];
  const raw = String(latest?.eventType ?? "");
  const lower = raw.toLowerCase();
  const isImport = lower.includes("downloadfolder");
  const base = raw ? raw.replace(/([a-z])([A-Z])/g, "$1 $2") : "Activity";
  const label = isImport ? "Imported" : base;
  const source = latest?.source ? ` - ${latest.source}` : "";
  return { text: `${label}${source}`, isImport };
}

export function ReleaseSearchModal(props: {
  open: boolean;
  onClose: () => void;
  mediaType: "movie" | "tv";
  mediaId: number | null;
  tmdbId?: number | null;
  tvdbId?: number | null;
  title: string;
  year?: string | number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  preferProwlarr?: boolean;
}) {
  const { open, onClose, mediaType, mediaId, tmdbId, tvdbId, title, year, posterUrl, backdropUrl, preferProwlarr } = props;
  const toast = useToast();
  const isIOS = useIsIOS();
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>("all");
  const [releaseSearch, setReleaseSearch] = useState("");
  const [releaseTotal, setReleaseTotal] = useState(0);
  const [releaseOffset, setReleaseOffset] = useState(0);
  const [grabbingKey, setGrabbingKey] = useState<string | null>(null);
  const [resolvedMediaId, setResolvedMediaId] = useState<number | null>(mediaId);
  const [replaceModal, setReplaceModal] = useState<{
    release: ReleaseRow;
    info: { quality?: string | null; sizeBytes?: number | null; dateAdded?: string | null };
  } | null>(null);
  const [replaceStatus, setReplaceStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useLockBodyScroll(open, isIOS === true);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const loadReleases = useCallback(async ({ offset, append }: { offset: number; append: boolean }) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        mediaType,
        offset: String(offset),
        limit: String(PAGE_SIZE)
      });
      if (mediaType === "movie") params.set("useUpgradeFinder", "1");
      if (preferProwlarr) params.set("preferProwlarr", "1");
      if (title) params.set("title", title);
      if (year !== undefined && year !== null && String(year).trim() !== "") {
        params.set("year", String(year));
      }
      if (mediaId) params.set("id", String(mediaId));
      if (!mediaId && tmdbId) params.set("tmdbId", String(tmdbId));
      if (!mediaId && tvdbId) params.set("tvdbId", String(tvdbId));
      const res = await fetch(`/api/v1/admin/media/releases?${params.toString()}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load releases");
      const items = Array.isArray(body?.items) ? body.items : [];
      const total = Number(body?.total ?? items.length);
      const resolvedId = typeof body?.resolvedId === "number" ? body.resolvedId : null;
      setResolvedMediaId(resolvedId);
      setReleaseTotal(total);
      setReleaseOffset(offset + items.length);
      setReleases(prev => append ? [...prev, ...items] : items);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load releases");
    } finally {
      setIsLoading(false);
    }
  }, [mediaId, mediaType, preferProwlarr, title, tmdbId, tvdbId, year, toast]);

  useEffect(() => {
    if (!open) return;
    setReleases([]);
    setReleaseTotal(0);
    setReleaseOffset(0);
    setReleaseSearch("");
    setReleaseFilter("all");
    setResolvedMediaId(mediaId ?? null);
    void loadReleases({ offset: 0, append: false });
  }, [open, mediaId, mediaType, tmdbId, tvdbId, loadReleases]);

  if (!open) return null;

  const handleRefresh = () => {
    if (isLoading) return;
    setReleases([]);
    setReleaseTotal(0);
    setReleaseOffset(0);
    void loadReleases({ offset: 0, append: false });
  };

  const handleLoadMore = () => {
    if (isLoading) return;
    if (releaseTotal === 0 && releases.length === 0) return;
    if (releaseOffset >= releaseTotal && releaseTotal !== 0) return;
    void loadReleases({ offset: releaseOffset, append: true });
  };

  const grabRelease = async (release: ReleaseRow, options?: { skipKey?: boolean }) => {
    const canGrab = Boolean(resolvedMediaId || tmdbId || tvdbId);
    if (!canGrab || grabbingKey) return;
    if (!release.guid && !release.downloadUrl) {
      toast.error("Release is missing a download link");
      return;
    }
    const releaseKey = release.guid || release.downloadUrl || release.title;
    if (!options?.skipKey) setGrabbingKey(releaseKey);
    try {
      const res = await csrfFetch("/api/v1/admin/media/grab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          mediaId: resolvedMediaId ?? undefined,
          tmdbId: tmdbId ?? undefined,
          tvdbId: tvdbId ?? undefined,
          guid: release.guid,
          indexerId: release.indexerId ?? undefined,
          downloadUrl: release.downloadUrl ?? undefined,
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
      if (!options?.skipKey) setGrabbingKey(null);
    }
  };

  const handleGrabRelease = async (release: ReleaseRow) => {
    if (mediaType === "movie" && resolvedMediaId && tmdbId) {
      try {
        const res = await fetch(`/api/v1/admin/media/info?mediaType=movie&id=${resolvedMediaId}`, {
          credentials: "include"
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.hasFile) {
          setReplaceStatus("idle");
          setReplaceModal({
            release,
            info: {
              quality: body?.quality ?? null,
              sizeBytes: body?.sizeBytes ?? null,
              dateAdded: body?.dateAdded ?? null
            }
          });
          return;
        }
      } catch {
        // fall through to grab if info fails
      }
    }
    await grabRelease(release);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  const confirmReplace = async () => {
    if (!replaceModal || !tmdbId) return;
    setReplaceStatus("loading");
    try {
      const removeRes = await csrfFetch("/api/v1/admin/media/movie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, action: "remove" })
      });
      const removeBody = await removeRes.json().catch(() => ({}));
      if (!removeRes.ok) throw new Error(removeBody?.error || "Failed to remove existing file");
      await grabRelease(replaceModal.release, { skipKey: true });
      setReplaceStatus("success");
      setTimeout(() => {
        setReplaceModal(null);
        setReplaceStatus("idle");
      }, 1200);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to replace file");
      setReplaceStatus("error");
    }
  };

  const query = releaseSearch.trim().toLowerCase();
  const filtered = releases
    .filter(release => matchesReleaseFilter(release, releaseFilter))
    .filter(release => (query ? release.title.toLowerCase().includes(query) : true));
  const isLoadingMore = isLoading && releases.length > 0;
  const canLoadMore = query.length > 0;

  const count4k = releases.filter(r => r.title.toLowerCase().includes("4k") || r.title.toLowerCase().includes("2160")).length;
  const count1080p = releases.filter(r => r.title.toLowerCase().includes("1080") && !r.title.toLowerCase().includes("4k")).length;
  const canGrab = Boolean(resolvedMediaId || tmdbId || tvdbId);

  const filterButtons: { value: ReleaseFilter; label: string; shortLabel?: string }[] = [
    { value: "all", label: "All" },
    { value: "4k", label: "4K" },
    { value: "1080p", label: "1080p" },
    { value: "720p", label: "720p" },
    { value: "480p", label: "480p" },
    { value: "telesync", label: "TS", shortLabel: "TS" },
    { value: "cam", label: "CAM" }
  ];

  const modal = (
    <>
      <div
        className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200 touch-auto"
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
        >
        <div className="flex-shrink-0 relative overflow-hidden">
          {backdropUrl ? (
            <div className="absolute inset-0">
              <Image
                src={backdropUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 1200px"
                className="object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/80 to-slate-950" />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-transparent to-slate-950/90" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-slate-950" />
          )}

          <div className="relative p-5 sm:p-6">
            <div className="sm:hidden flex justify-center mb-4">
              <div className="w-12 h-1.5 rounded-full bg-white/30" />
            </div>

            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                {posterUrl ? (
                  <div className="hidden sm:block flex-shrink-0 w-16 h-24 rounded-xl overflow-hidden ring-2 ring-white/20 shadow-xl relative">
                    <Image
                      src={posterUrl}
                      alt={title}
                      width={64}
                      height={96}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-orange-400 font-semibold uppercase tracking-widest mb-1">Interactive Search</p>
                  <h2 className="text-xl sm:text-2xl font-bold text-white truncate drop-shadow-lg">{title}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 backdrop-blur-sm">
                      {mediaType}
                    </span>
                    {year ? <span className="text-sm text-white/70 font-medium">{String(year)}</span> : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleRefresh}
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

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                <input
                  autoFocus
                  value={releaseSearch}
                  onChange={(event) => setReleaseSearch(event.target.value)}
                  placeholder="Search releases..."
                  inputMode="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full h-11 rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {filterButtons.map((btn) => (
                  <button
                    key={btn.value}
                    type="button"
                    onClick={() => setReleaseFilter(btn.value)}
                    className={cn(
                      "flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-300 backdrop-blur-sm",
                      releaseFilter === btn.value
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

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onScroll={(event) => {
            const target = event.currentTarget;
            if (!canLoadMore) return;
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 200) {
              handleLoadMore();
            }
          }}
        >
          {isLoading && releases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mb-6 border border-white/10">
                <Loader2 className="w-8 h-8 text-orange-300 animate-spin" />
              </div>
              <p className="text-lg font-bold text-white mb-1">Searching releases...</p>
              <p className="text-sm text-white/50">This may take a moment</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center mb-6 border border-white/10">
                <Search className="w-8 h-8 text-white/30" />
              </div>
              <p className="text-lg font-bold text-white mb-1">No releases found</p>
              <p className="text-sm text-white/50 text-center max-w-xs">
                {releaseFilter !== "all"
                  ? "Try selecting a different quality filter"
                  : "Try refreshing or check back later"}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-hidden min-w-0">
                <table className="w-full table-fixed min-w-0">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <th className="p-3 pl-5 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Release</th>
                      <th className="p-3 text-center text-xs font-bold text-white/50 uppercase tracking-wider w-20">Size</th>
                      <th className="p-3 text-center text-xs font-bold text-white/50 uppercase tracking-wider w-16">Age</th>
                      <th className="p-3 pr-5 text-right text-xs font-bold text-white/50 uppercase tracking-wider w-24"></th>
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
                      const isTorrent = release.protocol?.toLowerCase() === "torrent";

                      return (
                        <tr
                          key={rowKey}
                          className="group border-b border-white/5 last:border-b-0 hover:bg-gradient-to-r hover:from-orange-500/5 hover:to-amber-500/5 transition-all duration-300"
                          style={{ animationDelay: `${index * 20}ms` }}
                        >
                          <td className="p-3 pl-5 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn(
                                "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase shadow-lg group-hover:shadow-xl transition-all duration-300",
                                isTorrent
                                  ? "bg-gradient-to-br from-orange-500/20 to-orange-600/20 text-orange-300 ring-1 ring-orange-500/30 group-hover:ring-orange-500/50"
                                  : "bg-gradient-to-br from-sky-500/20 to-sky-600/20 text-sky-300 ring-1 ring-sky-500/30 group-hover:ring-sky-500/50"
                              )}>
                                {isTorrent ? "TOR" : "NZB"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn(
                                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border",
                                    is4k
                                      ? "bg-orange-500/20 text-orange-200 border-orange-500/30"
                                      : "bg-white/10 text-white/60 border-white/10"
                                  )}>
                                    {release.quality || "-"}
                                  </span>
                                  {historyDisplay.isImport && (
                                    <span title="Previously imported" className="flex items-center gap-1 text-[10px] text-sky-400">
                                      <Cloud className="h-3.5 w-3.5" />
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    "font-semibold text-sm leading-tight truncate group-hover:text-orange-100 transition-colors",
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
                                    <span>{release.indexer || "-"}</span>
                                  )}
                                  {release.language && release.language !== "-" && (
                                    <>
                                      <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
                                      <span>{release.language}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-white/70 font-semibold text-sm">
                              {formatBytes(release.size ?? undefined)}
                            </span>
                          </td>
                          <td className="p-3 text-center text-white/60 text-sm">
                            {formatAge(release.age)}
                          </td>
                          <td className="p-3 pr-5 text-right">
                            <button
                              type="button"
                              disabled={grabbingKey === (release.guid || release.downloadUrl || release.title) || !canGrab}
                              onClick={() => handleGrabRelease(release)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all duration-300",
                                grabbingKey === (release.guid || release.downloadUrl || release.title) || !canGrab
                                  ? "bg-white/10 text-white/50 cursor-not-allowed"
                                  : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30 hover:ring-emerald-500/50 active:scale-95"
                              )}
                            >
                              {grabbingKey === (release.guid || release.downloadUrl || release.title) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              <span>{grabbingKey === (release.guid || release.downloadUrl || release.title) ? "..." : "Grab"}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden p-4 space-y-3">
                {filtered.map((release, index) => {
                  const rowKey = release.guid || `${release.indexerId ?? "x"}-${release.title}`;
                  const is4k = release.title.toLowerCase().includes("4k") ||
                               release.title.toLowerCase().includes("2160") ||
                               release.quality.toLowerCase().includes("4k") ||
                               release.quality.toLowerCase().includes("2160");
                  const displayTitle = release.year ? `${release.title} (${release.year})` : release.title;
                  const historyDisplay = getHistoryDisplay(release.history);
                  const isTorrent = release.protocol?.toLowerCase() === "torrent";

                  return (
                    <div
                      key={rowKey}
                      className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/10"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/0 to-amber-500/0 group-hover:from-orange-500/5 group-hover:to-amber-500/5 transition-all duration-500" />

                      <div className="relative p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border",
                            isTorrent
                              ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                              : "bg-sky-500/20 text-sky-300 border-sky-500/30"
                          )}>
                            {isTorrent ? "TOR" : "NZB"}
                          </span>
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold border",
                            is4k
                              ? "bg-orange-500/20 text-orange-200 border-orange-500/30"
                              : "bg-white/10 text-white/60 border-white/10"
                          )}>
                            {release.quality || "-"}
                          </span>
                          {historyDisplay.isImport && (
                            <Cloud className="h-4 w-4 text-sky-400" />
                          )}
                        </div>

                        <div className={cn(
                          "font-semibold text-base leading-snug mb-3 group-hover:text-orange-100 transition-colors",
                          is4k ? "text-orange-200" : "text-white"
                        )}>
                          {displayTitle}
                        </div>

                        <div className="flex items-center gap-4 mb-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white/40">Size:</span>
                            <span className="font-semibold text-white/80">{formatBytes(release.size ?? undefined)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-white/40">Age:</span>
                            <span className="font-semibold text-white/80">{formatAge(release.age)}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-xs text-white/40">
                            {historyDisplay.text}
                          </div>
                            <button
                              type="button"
                              disabled={grabbingKey === (release.guid || release.downloadUrl || release.title) || !canGrab}
                              onClick={() => handleGrabRelease(release)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-300",
                                grabbingKey === (release.guid || release.downloadUrl || release.title) || !canGrab
                                  ? "bg-white/10 text-white/50 cursor-not-allowed"
                                  : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30 hover:ring-emerald-500/50"
                              )}
                            >
                            {grabbingKey === (release.guid || release.downloadUrl || release.title) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            <span>{grabbingKey === (release.guid || release.downloadUrl || release.title) ? "..." : "Grab"}</span>
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

        <div className="flex-shrink-0 flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-5 py-4 text-sm">
          <div className="text-white/50">
            {filtered.length} of {releases.length} shown
            {releaseFilter !== "all" && <span className="text-white/30"> - {releaseFilter} filter</span>}
          </div>
          {isLoadingMore ? (
            <div className="flex items-center gap-2 text-orange-300 font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more...
            </div>
          ) : releaseTotal > 0 && releases.length < releaseTotal ? (
            <div className="text-white/40">{canLoadMore ? "Scroll to load more" : "Search to load more"}</div>
          ) : null}
        </div>
        </div>
      </div>
      <Modal
        open={!!replaceModal}
        title="Replace Existing File?"
        onClose={() => {
          if (replaceStatus === "loading") return;
          setReplaceModal(null);
          setReplaceStatus("idle");
        }}
      >
        <div className="space-y-4">
          <div className="text-sm text-white/80">
            There is already a file for this movie.
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
            <div className="text-[10px] uppercase tracking-wider text-white/50">Current File</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-white">{replaceModal?.info.quality || "Unknown"}</span>
              {replaceModal?.info.sizeBytes ? (
                <span className="text-white/50">| {formatBytes(replaceModal.info.sizeBytes)}</span>
              ) : null}
              {replaceModal?.info.dateAdded ? (
                <span className="text-white/50">| Added: {formatDate(replaceModal.info.dateAdded)}</span>
              ) : null}
            </div>
          </div>
          <div className="text-sm text-white/70">
            Do you want to remove this one and download the one you&apos;re about to grab?
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (replaceStatus === "loading") return;
                setReplaceModal(null);
                setReplaceStatus("idle");
              }}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
              disabled={replaceStatus === "loading"}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmReplace}
              disabled={replaceStatus === "loading"}
              className={cn(
                "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2",
                replaceStatus === "success"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : replaceStatus === "error"
                  ? "bg-red-600 hover:bg-red-500"
                  : "bg-indigo-600 hover:bg-indigo-500"
              )}
            >
              {replaceStatus === "loading" ? "Replacing..." : "Yes, Replace & Grab"}
              {replaceStatus === "success" ? <Check className="h-4 w-4" /> : null}
              {replaceStatus === "error" ? <X className="h-4 w-4" /> : null}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
