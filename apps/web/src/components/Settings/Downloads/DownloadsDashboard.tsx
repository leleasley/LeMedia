"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";
import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    ClockIcon,
    PauseCircleIcon,
    ServerStackIcon,
    WifiIcon,
} from "@heroicons/react/24/outline";

// --------------------------------------------------------------------------
// Types (mirror of what the API returns)
// --------------------------------------------------------------------------
type NormalizedQueueItem = {
    id: string | number;
    title: string;
    mediaTitle: string;
    size: number;
    sizeLeft: number;
    progress: number;
    speedBytesPerSec?: number;
    timeleft?: string;
    estimatedCompletionTime?: string;
    status: string;
    trackedDownloadStatus?: string;
    downloadClient?: string;
    protocol?: string;
    indexer?: string;
    errorMessage?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    episodeTitle?: string;
};

type ServiceQueue = {
    serviceId: number;
    serviceName: string;
    serviceType: string;
    items: NormalizedQueueItem[];
    totalRecords: number;
    dlSpeedBytesPerSec?: number;
    upSpeedBytesPerSec?: number;
    error?: string;
};

type DownloadsResponse = { queues: ServiceQueue[] };

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
const fetcher = (url: string) => fetch(url).then(r => r.json());

function formatBytes(bytes: number, decimals = 1): string {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function statusConfig(status: string): { label: string; color: string; icon: React.ReactNode } {
    const s = status.toLowerCase();
    if (s.includes("fail") || s.includes("error")) return { label: "Failed", color: "text-red-400 bg-red-400/10 border-red-400/20", icon: <ExclamationTriangleIcon className="w-3 h-3" /> };
    if (s.includes("download")) return { label: "Downloading", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: <ArrowDownTrayIcon className="w-3 h-3" /> };
    if (s.includes("queue")) return { label: "Queued", color: "text-slate-400 bg-slate-400/10 border-slate-400/20", icon: <ClockIcon className="w-3 h-3" /> };
    if (s.includes("pause")) return { label: "Paused", color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: <PauseCircleIcon className="w-3 h-3" /> };
    if (s.includes("seed") || s.includes("upload")) return { label: "Seeding", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon: <ArrowPathIcon className="w-3 h-3" /> };
    if (s.includes("import") || s.includes("complet")) return { label: "Importing", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20", icon: <CheckCircleIcon className="w-3 h-3" /> };
    if (s.includes("stall") || s.includes("check") || s.includes("warn")) return { label: "Warning", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", icon: <ExclamationTriangleIcon className="w-3 h-3" /> };
    return { label: status, color: "text-white/50 bg-white/5 border-white/10", icon: null };
}

function serviceTypeLabel(type: string): string {
    const map: Record<string, string> = {
        radarr: "Radarr", sonarr: "Sonarr", qbittorrent: "qBittorrent",
        sabnzbd: "SABnzbd", nzbget: "nzbget",
    };
    return map[type] ?? type;
}

function serviceTypeColor(type: string): string {
    const map: Record<string, string> = {
        radarr: "from-orange-500/20 to-amber-500/20 border-orange-500/20",
        sonarr: "from-blue-500/20 to-cyan-500/20 border-blue-500/20",
        qbittorrent: "from-green-500/20 to-emerald-500/20 border-green-500/20",
        sabnzbd: "from-purple-500/20 to-violet-500/20 border-purple-500/20",
        nzbget: "from-teal-500/20 to-cyan-500/20 border-teal-500/20",
    };
    return map[type] ?? "from-slate-500/20 to-gray-500/20 border-slate-500/20";
}

function protocolBadge(protocol?: string): React.ReactNode | null {
    if (!protocol) return null;
    const isUsenet = protocol.toLowerCase().includes("usenet") || protocol.toLowerCase().includes("nzb");
    return (
        <span className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
            isUsenet ? "text-purple-300 bg-purple-400/10 border-purple-400/20" : "text-green-300 bg-green-400/10 border-green-400/20"
        )}>
            {isUsenet ? "Usenet" : "Torrent"}
        </span>
    );
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------
function ProgressBar({ progress, status }: { progress: number; status: string }) {
    const s = status.toLowerCase();
    const color = s.includes("fail") || s.includes("error")
        ? "bg-red-500"
        : s.includes("pause") ? "bg-amber-500"
        : s.includes("seed") || s.includes("complet") ? "bg-emerald-500"
        : "bg-blue-500";

    return (
        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
                className={cn("h-full rounded-full transition-all duration-500", color)}
                style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
            />
        </div>
    );
}

function QueueItem({ item }: { item: NormalizedQueueItem }) {
    const { label, color, icon } = statusConfig(item.status);
    const subtitle = item.seasonNumber != null && item.episodeNumber != null
        ? `S${String(item.seasonNumber).padStart(2, "0")}E${String(item.episodeNumber).padStart(2, "0")}${item.episodeTitle ? ` · ${item.episodeTitle}` : ""}`
        : item.downloadClient;

    return (
        <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.03] p-3 hover:bg-white/[0.05] transition-colors">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{item.mediaTitle}</p>
                    {subtitle && <p className="text-xs text-white/40 truncate mt-0.5">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {protocolBadge(item.protocol)}
                    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", color)}>
                        {icon}{label}
                    </span>
                </div>
            </div>

            <ProgressBar progress={item.progress} status={item.status} />

            <div className="flex items-center justify-between text-[11px] text-white/40">
                <span>
                    {item.progress}% · {formatBytes(item.sizeLeft)} left / {formatBytes(item.size)}
                </span>
                <div className="flex items-center gap-3">
                    {item.speedBytesPerSec != null && item.speedBytesPerSec > 0 && (
                        <span className="text-blue-300">{formatBytes(item.speedBytesPerSec)}/s</span>
                    )}
                    {item.timeleft && item.timeleft !== "00:00:00" && (
                        <span className="flex items-center gap-1"><ClockIcon className="w-3 h-3" />{item.timeleft}</span>
                    )}
                    {item.errorMessage && (
                        <span className="text-red-300 truncate max-w-[200px]" title={item.errorMessage}>
                            <ExclamationTriangleIcon className="w-3 h-3 inline mr-0.5" />{item.errorMessage}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function ServiceCard({ queue }: { queue: ServiceQueue }) {
    const gradientBorder = serviceTypeColor(queue.serviceType);
    const totalFailing = queue.items.filter(i => i.status.toLowerCase().includes("fail") || i.status.toLowerCase().includes("error")).length;
    const totalDownloading = queue.items.filter(i => i.status.toLowerCase().includes("download")).length;

    return (
        <div className={cn("rounded-2xl border bg-gradient-to-br p-4 space-y-3", gradientBorder)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ServerStackIcon className="w-4 h-4 text-white/50" />
                    <div>
                        <span className="text-sm font-semibold text-white">{queue.serviceName}</span>
                        <span className="ml-2 text-xs text-white/40">{serviceTypeLabel(queue.serviceType)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                    {queue.dlSpeedBytesPerSec != null && queue.dlSpeedBytesPerSec > 0 && (
                        <span className="flex items-center gap-1 text-blue-300">
                            <ArrowDownTrayIcon className="w-3 h-3" />{formatBytes(queue.dlSpeedBytesPerSec)}/s
                        </span>
                    )}
                    <span>{queue.totalRecords} item{queue.totalRecords !== 1 ? "s" : ""}</span>
                </div>
            </div>

            {/* Service error */}
            {queue.error && (
                <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300 flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Cannot connect: {queue.error}</span>
                </div>
            )}

            {/* Status summary pills */}
            {!queue.error && (totalDownloading > 0 || totalFailing > 0) && (
                <div className="flex flex-wrap gap-1.5">
                    {totalDownloading > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-blue-400/10 text-blue-300 border border-blue-400/20">
                            <ArrowDownTrayIcon className="w-3 h-3" />{totalDownloading} downloading
                        </span>
                    )}
                    {totalFailing > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-red-400/10 text-red-300 border border-red-400/20">
                            <ExclamationTriangleIcon className="w-3 h-3" />{totalFailing} failed
                        </span>
                    )}
                </div>
            )}

            {/* Items */}
            {!queue.error && queue.items.length === 0 && (
                <p className="text-xs text-white/30 text-center py-4">Queue is empty</p>
            )}
            {queue.items.length > 0 && (
                <div className="space-y-2">
                    {queue.items.map(item => <QueueItem key={String(item.id)} item={item} />)}
                </div>
            )}
        </div>
    );
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------
export function DownloadsDashboard() {
    const { data, error, isLoading, mutate, isValidating } = useSWR<DownloadsResponse>(
        "/api/v1/admin/downloads",
        fetcher,
        { refreshInterval: 30_000, revalidateOnFocus: true }
    );

    const queues = data?.queues ?? [];
    const totalItems = queues.reduce((sum, q) => sum + q.items.length, 0);
    const totalFailing = queues.flatMap(q => q.items).filter(i => i.status.toLowerCase().includes("fail") || i.status.toLowerCase().includes("error")).length;
    const totalDownloading = queues.flatMap(q => q.items).filter(i => i.status.toLowerCase().includes("download")).length;
    const totalQueued = queues.flatMap(q => q.items).filter(i => i.status.toLowerCase().includes("queue")).length;
    const totalSpeed = queues.reduce((sum, q) => sum + (q.dlSpeedBytesPerSec ?? 0), 0);
    const hasAnyError = queues.some(q => q.error);

    return (
        <div className="space-y-6">
            {/* Summary bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Total Items", value: totalItems, color: "text-white", sub: null },
                    { label: "Downloading", value: totalDownloading, color: "text-blue-300", sub: totalSpeed > 0 ? formatBytes(totalSpeed) + "/s" : null },
                    { label: "Queued", value: totalQueued, color: "text-white/60", sub: null },
                    { label: "Failed", value: totalFailing, color: totalFailing > 0 ? "text-red-300" : "text-white/40", sub: null },
                ].map(stat => (
                    <div key={stat.label} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                        <div className={cn("text-2xl font-bold tabular-nums", stat.color)}>{stat.value}</div>
                        <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
                        {stat.sub && <div className="text-xs text-blue-300 mt-0.5">{stat.sub}</div>}
                    </div>
                ))}
            </div>

            {/* Refresh controls */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-white/30">Auto-refreshes every 30s</p>
                <button
                    onClick={() => mutate()}
                    disabled={isValidating}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                    <ArrowPathIcon className={cn("w-3.5 h-3.5", isValidating && "animate-spin")} />
                    Refresh
                </button>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <ArrowPathIcon className="w-8 h-8 text-white/20 animate-spin" />
                    <p className="text-sm text-white/30">Fetching queue data…</p>
                </div>
            )}

            {/* Fetch error */}
            {error && !isLoading && (
                <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-6 text-center">
                    <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-red-300">Failed to load download data</p>
                    <p className="text-xs text-red-400/70 mt-1">{String(error?.message ?? error)}</p>
                </div>
            )}

            {/* No services configured */}
            {!isLoading && !error && queues.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
                    <WifiIcon className="w-10 h-10 text-white/10 mx-auto mb-3" />
                    <p className="text-sm font-medium text-white/40">No download services configured</p>
                    <p className="text-xs text-white/20 mt-1">Add Radarr, Sonarr, qBittorrent, SABnzbd, or nzbget on the Services page.</p>
                </div>
            )}

            {/* Service cards */}
            {!isLoading && queues.length > 0 && (
                <div className="space-y-4">
                    {queues.map(q => <ServiceCard key={q.serviceId} queue={q} />)}
                </div>
            )}
        </div>
    );
}
