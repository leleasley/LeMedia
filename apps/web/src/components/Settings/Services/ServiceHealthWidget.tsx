"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, CheckCircle2, XCircle, Database, Film, Tv, RefreshCcw } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";

type ServiceHealthDetail = {
    id: number;
    name: string;
    type: "radarr" | "sonarr" | string;
    healthy: boolean;
    enabled: boolean;
    statusText?: string;
    queueSize: number;
    failedCount: number;
    disk?: {
        path?: string;
        freeBytes?: number;
        totalBytes?: number;
    };
};

type HealthResponse = {
    database: boolean;
    tmdb: boolean;
    jellyfin: boolean;
    services: Record<string, boolean>;
    serviceDetails?: ServiceHealthDetail[];
};

const fetcher = (url: string) => fetch(url).then(r => r.json());

function formatBytes(bytes?: number) {
    if (typeof bytes !== "number" || Number.isNaN(bytes)) return "—";
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

function StatusItem({ label, healthy, icon: Icon }: { label: string; healthy: boolean; icon: any }) {
    return (
        <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${healthy ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <span className="font-medium text-gray-200">{label}</span>
            </div>
            {healthy ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Operational</span>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                    <XCircle className="h-4 w-4" />
                    <span>Issue</span>
                </div>
            )}
        </div>
    );
}

export function ServiceHealthWidget({ services }: { services: any[] }) {
    const toast = useToast();
    const { data, isLoading, mutate } = useSWR<HealthResponse>("/api/admin/status/health", fetcher, {
        refreshInterval: 30000
    });
    const [retryingId, setRetryingId] = useState<number | null>(null);

    const mediaDetails: ServiceHealthDetail[] = useMemo(() => {
        if (data?.serviceDetails?.length) return data.serviceDetails;
        // Fallback to simple status map
        return services.map((svc: any) => ({
            id: svc.id,
            name: svc.name,
            type: svc.type,
            healthy: data?.services?.[`${svc.type}:${svc.id}`] ?? false,
            enabled: svc.enabled,
            statusText: svc.enabled ? undefined : "Disabled",
            queueSize: 0,
            failedCount: 0
        }));
    }, [data?.serviceDetails, data?.services, services]);

    const handleRetry = async (detail: ServiceHealthDetail) => {
        setRetryingId(detail.id);
        try {
            const res = await fetch("/api/admin/status/retry-downloads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serviceId: detail.id })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.error) {
                throw new Error(body?.error || "Failed to trigger retry");
            }
            toast.success("Retry started");
            void mutate();
        } catch (err: any) {
            toast.error(err?.message ?? "Retry failed");
        } finally {
            setRetryingId(null);
        }
    };

    if (isLoading && !data) {
        return (
            <div className="rounded-xl border border-white/10 bg-black/20 p-6 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">System Status</h3>
            <div className="grid gap-4 md:grid-cols-2">
                <StatusItem label="Database" healthy={data.database} icon={Database} />
                <StatusItem label="TMDB API" healthy={data.tmdb} icon={Film} />
                <StatusItem label="Jellyfin" healthy={data.jellyfin} icon={Tv} />
            </div>

            {mediaDetails.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-white/80">Media Services</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                        {mediaDetails.map(detail => (
                            <div
                                key={detail.id}
                                className="rounded-lg border border-white/10 bg-white/5 p-4 flex flex-col gap-2"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`h-2 w-2 rounded-full ${detail.healthy ? "bg-emerald-500" : "bg-red-500"}`} />
                                        <div className="text-sm font-semibold text-white">
                                            {detail.name} <span className="text-xs text-white/50">({detail.type})</span>
                                        </div>
                                    </div>
                                    <span className="text-[11px] uppercase tracking-wide text-white/50">{detail.statusText ?? ""}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
                                    <span className="rounded-full bg-white/10 px-2 py-1">Queue: {detail.queueSize}</span>
                                    <span className={`rounded-full px-2 py-1 ${detail.failedCount > 0 ? "bg-red-500/20 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                                        Failed imports: {detail.failedCount}
                                    </span>
                                    {detail.disk && (
                                        <span className="rounded-full bg-white/10 px-2 py-1">
                                            Disk: {detail.disk.path ? `${detail.disk.path} • ` : ""}
                                            {formatBytes(detail.disk.freeBytes)} free
                                            {detail.disk.totalBytes ? ` / ${formatBytes(detail.disk.totalBytes)}` : ""}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-[11px] text-white/60">
                                        {detail.enabled ? (detail.healthy ? "Operational" : "Offline") : "Disabled"}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRetry(detail)}
                                        disabled={!detail.enabled || retryingId === detail.id}
                                        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {retryingId === detail.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCcw className="h-3.5 w-3.5" />
                                        )}
                                        <span>Retry failed imports</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
