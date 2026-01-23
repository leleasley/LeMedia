"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Search, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import type { UpgradeFinderItem } from "@/lib/upgrade-finder";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
    label: "Queued",
    bg: "bg-white/5",
    text: "text-white/50",
    border: "border-white/10"
  }
};

function formatBytes(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function UpgradeFinderClient({ initialItems }: { initialItems: UpgradeFinderItem[] }) {
  const toast = useToast();
  const [items, setItems] = useState<UpgradeFinderItem[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UpgradeFinderItem["upgradeStatus"]>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());
  const [hintMap, setHintMap] = useState<Record<number, { status: HintStatus; text?: string }>>({});
  const autoCheckedRef = useRef<Set<number>>(new Set());

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

  const handleSearchUpgrade = async (item: UpgradeFinderItem) => {
    if (runningIds.has(item.id)) return;
    setRunningIds(prev => new Set(prev).add(item.id));
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
        next.delete(item.id);
        return next;
      });
    }
  };

  const runCheck = async (item: UpgradeFinderItem, { silent }: { silent: boolean }) => {
    try {
      setHintMap(prev => ({ ...prev, [item.id]: { status: "checking" } }));
      const res = await csrfFetch("/api/v1/admin/upgrade-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: item.mediaType, id: item.id, mode: "check" })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Check failed");
      const isAvailable = String(body?.hint ?? "").toLowerCase().includes("4k");
      setHintMap(prev => ({
        ...prev,
        [item.id]: {
          status: isAvailable ? "available" : "none",
          text: body?.hint ?? undefined
        }
      }));
    } catch (err: any) {
      setHintMap(prev => ({ ...prev, [item.id]: { status: "error", text: err?.message ?? "Check failed" } }));
      if (!silent) {
        toast.error(err?.message ?? "Check failed");
      }
    }
  };

  const handleCheckUpgrade = async (item: UpgradeFinderItem) => {
    if (runningIds.has(item.id)) return;
    setRunningIds(prev => new Set(prev).add(item.id));
    try {
      await runCheck(item, { silent: false });
    } finally {
      setRunningIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  useEffect(() => {
    const queue = items.filter(item => !autoCheckedRef.current.has(item.id));
    if (queue.length === 0) return;
    let cancelled = false;
    const maxConcurrent = 4;

    const worker = async () => {
      while (!cancelled) {
        const item = queue.shift();
        if (!item) return;
        if (!item.interactiveUrl) {
          autoCheckedRef.current.add(item.id);
          setHintMap(prev => ({ ...prev, [item.id]: { status: "idle" } }));
          continue;
        }
        autoCheckedRef.current.add(item.id);
        await runCheck(item, { silent: true });
      }
    };

    const workers = Array.from({ length: Math.min(maxConcurrent, queue.length) }, () => worker());
    void Promise.all(workers);

    return () => {
      cancelled = true;
    };
  }, [items]);

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
                  const isRunning = runningIds.has(item.id);
                  const hintState = hintMap[item.id] ?? { status: "idle" as HintStatus };
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
                        {hintState.text && (
                          <div className="mt-2 text-[11px] text-white/50">{hintState.text}</div>
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
                            {item.interactiveUrl && (
                              <DropdownMenuItem onSelect={() => window.open(item.interactiveUrl, "_blank", "noreferrer")}>
                                Interactive Search
                              </DropdownMenuItem>
                            )}
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
    </div>
  );
}
