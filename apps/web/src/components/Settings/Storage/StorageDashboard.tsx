"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";
import {
    CircleStackIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    ServerIcon,
    FolderIcon,
} from "@heroicons/react/24/outline";

// --------------------------------------------------------------------------
// Types (mirror of what the API returns)
// --------------------------------------------------------------------------
type DiskEntry = {
    path: string;
    label: string;
    freeSpace: number;
    totalSpace: number;
    usedSpace: number;
    usedPercent: number;
};

type RootFolder = {
    path: string;
    freeSpace: number;
    accessible: boolean;
};

type ServiceStorage = {
    serviceId: number;
    serviceName: string;
    serviceType: "radarr" | "sonarr";
    diskSpace: DiskEntry[];
    rootFolders: RootFolder[];
    error?: string;
};

type StorageResponse = {
    services: ServiceStorage[];
    summary: (DiskEntry & { seenBy: string[] })[];
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
const fetcher = (url: string) => fetch(url).then(r => r.json());

function formatBytes(bytes: number, decimals = 1): string {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function diskBarColor(usedPercent: number): string {
    if (usedPercent >= 90) return "bg-red-500";
    if (usedPercent >= 75) return "bg-amber-500";
    if (usedPercent >= 50) return "bg-yellow-500";
    return "bg-emerald-500";
}

function diskTextColor(usedPercent: number): string {
    if (usedPercent >= 90) return "text-red-300";
    if (usedPercent >= 75) return "text-amber-300";
    return "text-emerald-300";
}

function serviceTypeBadgeColor(type: "radarr" | "sonarr"): string {
    return type === "radarr"
        ? "text-orange-300 bg-orange-400/10 border-orange-400/20"
        : "text-blue-300 bg-blue-400/10 border-blue-400/20";
}

// --------------------------------------------------------------------------
// DiskBar
// --------------------------------------------------------------------------
function DiskBar({ disk }: { disk: DiskEntry }) {
    const pct = disk.totalSpace > 0 ? disk.usedPercent : 0;
    const noInfo = disk.totalSpace <= 0;

    return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <CircleStackIcon className="w-4 h-4 text-white/40 flex-shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{disk.label !== disk.path ? disk.label : disk.path}</p>
                        {disk.label !== disk.path && (
                            <p className="text-xs text-white/30 truncate">{disk.path}</p>
                        )}
                    </div>
                </div>
                <span className={cn("text-lg font-bold tabular-nums flex-shrink-0", noInfo ? "text-white/20" : diskTextColor(pct))}>
                    {noInfo ? "—" : `${pct}%`}
                </span>
            </div>

            {noInfo ? (
                <div className="h-2 w-full rounded-full bg-white/10">
                    <div className="h-full w-full rounded-full bg-white/5 animate-pulse" />
                </div>
            ) : (
                <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                        className={cn("h-full rounded-full transition-all duration-700", diskBarColor(pct))}
                        style={{ width: `${Math.max(2, pct)}%` }}
                    />
                </div>
            )}

            <div className="flex items-center justify-between text-xs text-white/40">
                <span>{formatBytes(disk.freeSpace)} free</span>
                {disk.totalSpace > 0 && (
                    <span>{formatBytes(disk.usedSpace)} used / {formatBytes(disk.totalSpace)} total</span>
                )}
            </div>
        </div>
    );
}

// --------------------------------------------------------------------------
// Root Folder card
// --------------------------------------------------------------------------
function RootFolderRow({ folder }: { folder: RootFolder }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5">
            <FolderIcon className={cn("w-4 h-4 flex-shrink-0", folder.accessible ? "text-white/40" : "text-red-400/60")} />
            <div className="min-w-0 flex-1">
                <p className="text-xs text-white/70 truncate font-mono">{folder.path}</p>
            </div>
            {!folder.accessible && (
                <span className="flex-shrink-0 text-[10px] text-red-300 border border-red-400/20 bg-red-400/10 px-1.5 py-0.5 rounded">
                    Inaccessible
                </span>
            )}
            {folder.freeSpace > 0 && (
                <span className="flex-shrink-0 text-xs text-white/30">{formatBytes(folder.freeSpace)} free</span>
            )}
        </div>
    );
}

// --------------------------------------------------------------------------
// Service card
// --------------------------------------------------------------------------
function ServiceStorageCard({ svc }: { svc: ServiceStorage }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex items-center gap-3">
                <ServerIcon className="w-5 h-5 text-white/40" />
                <div>
                    <span className="text-sm font-semibold text-white">{svc.serviceName}</span>
                    <span className={cn("ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded border", serviceTypeBadgeColor(svc.serviceType))}>
                        {svc.serviceType === "radarr" ? "Radarr" : "Sonarr"}
                    </span>
                </div>
            </div>

            {svc.error && (
                <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300 flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Cannot connect: {svc.error}</span>
                </div>
            )}

            {!svc.error && (
                <>
                    {svc.diskSpace.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs text-white/30 uppercase tracking-wide font-medium">Disk Space</p>
                            {svc.diskSpace.map((d, i) => <DiskBar key={`${d.path}-${i}`} disk={d} />)}
                        </div>
                    )}

                    {svc.rootFolders.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs text-white/30 uppercase tracking-wide font-medium">Root Folders</p>
                            {svc.rootFolders.map((f, i) => <RootFolderRow key={`${f.path}-${i}`} folder={f} />)}
                        </div>
                    )}

                    {svc.diskSpace.length === 0 && svc.rootFolders.length === 0 && (
                        <p className="text-xs text-white/20 text-center py-4">No disk information returned</p>
                    )}
                </>
            )}
        </div>
    );
}

// --------------------------------------------------------------------------
// Summary across all disks
// --------------------------------------------------------------------------
function SummarySection({ summary }: { summary: (DiskEntry & { seenBy: string[] })[] }) {
    if (summary.length === 0) return null;
    const uniqueDisks = summary.filter(d => d.totalSpace > 0);
    if (uniqueDisks.length === 0) return null;

    const totalFree = uniqueDisks.reduce((sum, d) => sum + d.freeSpace, 0);
    const totalStorage = uniqueDisks.reduce((sum, d) => sum + d.totalSpace, 0);

    return (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-teal-500/10 to-cyan-500/10 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white/80">Overall Storage Summary</h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xl font-bold text-white tabular-nums">{formatBytes(totalFree)}</div>
                    <div className="text-xs text-white/40 mt-0.5">Total Free</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xl font-bold text-white tabular-nums">{formatBytes(totalStorage)}</div>
                    <div className="text-xs text-white/40 mt-0.5">Total Capacity</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className={cn("text-xl font-bold tabular-nums", diskTextColor(totalStorage > 0 ? Math.round(((totalStorage - totalFree) / totalStorage) * 100) : 0))}>
                        {totalStorage > 0 ? Math.round(((totalStorage - totalFree) / totalStorage) * 100) : 0}%
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Used</div>
                </div>
            </div>

            <div className="space-y-2">
                {uniqueDisks.map((d, i) => <DiskBar key={`summary-${d.path}-${i}`} disk={d} />)}
            </div>
        </div>
    );
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------
export function StorageDashboard() {
    const { data, error, isLoading, mutate, isValidating } = useSWR<StorageResponse>(
        "/api/v1/admin/storage",
        fetcher,
        { refreshInterval: 60_000, revalidateOnFocus: true }
    );

    const services = data?.services ?? [];
    const summary = data?.summary ?? [];

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-white/30">Auto-refreshes every 60s</p>
                <button
                    onClick={() => mutate()}
                    disabled={isValidating}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                    <ArrowPathIcon className={cn("w-3.5 h-3.5", isValidating && "animate-spin")} />
                    Refresh
                </button>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <ArrowPathIcon className="w-8 h-8 text-white/20 animate-spin" />
                    <p className="text-sm text-white/30">Fetching storage data…</p>
                </div>
            )}

            {/* Fetch error */}
            {error && !isLoading && (
                <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-6 text-center">
                    <ExclamationTriangleIcon className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-red-300">Failed to load storage data</p>
                    <p className="text-xs text-red-400/70 mt-1">{String(error?.message ?? error)}</p>
                </div>
            )}

            {/* No services */}
            {!isLoading && !error && services.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
                    <CircleStackIcon className="w-10 h-10 text-white/10 mx-auto mb-3" />
                    <p className="text-sm font-medium text-white/40">No media services configured</p>
                    <p className="text-xs text-white/20 mt-1">Add Radarr or Sonarr on the Services page to see storage information.</p>
                </div>
            )}

            {/* Content */}
            {!isLoading && services.length > 0 && (
                <>
                    <SummarySection summary={summary} />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {services.map(svc => (
                            <ServiceStorageCard key={svc.serviceId} svc={svc} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
