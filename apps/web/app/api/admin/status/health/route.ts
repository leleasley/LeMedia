import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { checkDatabaseHealth, getJellyfinConfig } from "@/db";
import { getTmdbConfig } from "@/lib/tmdb";
import { listMediaServices, getMediaServiceSecretById } from "@/lib/service-config";
import { createRadarrFetcher } from "@/lib/radarr";
import { createSonarrFetcher } from "@/lib/sonarr";
import { decryptSecret } from "@/lib/encryption";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

export const dynamic = 'force-dynamic';

type ServiceDetail = {
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

async function checkService(type: string, baseUrl: string, apiKey: string) {
    try {
        if (type === "radarr") {
            const fetcher = createRadarrFetcher(baseUrl, apiKey);
            const res = await fetcher("/api/v3/system/status");
            return { healthy: res?.appName === "Radarr", statusText: res?.version ? `v${res.version}` : undefined };
        }
        if (type === "sonarr") {
            const fetcher = createSonarrFetcher(baseUrl, apiKey);
            const res = await fetcher("/api/v3/system/status");
            return { healthy: res?.appName === "Sonarr", statusText: res?.version ? `v${res.version}` : undefined };
        }
        return { healthy: false };
    } catch {
        return { healthy: false };
    }
}

function isFailedQueueItem(item: any) {
    const status = (item?.trackedDownloadStatus || item?.status || "").toString().toLowerCase();
    return status.includes("failed") || status.includes("warning");
}

export async function GET(req: NextRequest) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;

    // 1. Database
    const dbHealthy = await checkDatabaseHealth();

    // 2. TMDB
    let tmdbHealthy = false;
    try {
        await getTmdbConfig();
        tmdbHealthy = true;
    } catch { }

    // 3. Jellyfin
    let jellyfinHealthy = false;
    const jfConfig = await getJellyfinConfig();
    if (jfConfig.hostname && jfConfig.apiKeyEncrypted) {
        try {
            const apiKey = decryptSecret(jfConfig.apiKeyEncrypted);
            const port = jfConfig.port ? `:${jfConfig.port}` : "";
            const base = jfConfig.urlBase ? (jfConfig.urlBase.startsWith("/") ? jfConfig.urlBase : `/${jfConfig.urlBase}`) : "";
            const url = `${jfConfig.useSsl ? "https" : "http"}://${jfConfig.hostname}${port}${base}/System/Info`;
            
            const res = await fetch(url, {
                headers: { "X-Emby-Token": apiKey },
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) jellyfinHealthy = true;
        } catch { }
    }

    // 4. Media Services
    const services = await listMediaServices();
    const serviceHealth: Record<string, boolean> = {};
    const serviceDetails: ServiceDetail[] = [];

    await Promise.all(services.map(async (svc) => {
        const detail: ServiceDetail = {
            id: svc.id,
            name: svc.name,
            type: svc.type,
            enabled: svc.enabled,
            healthy: false,
            queueSize: 0,
            failedCount: 0,
        };

        if (!svc.enabled) {
            serviceHealth[`${svc.type}:${svc.id}`] = false;
            serviceDetails.push(detail);
            return;
        }

        const secret = await getMediaServiceSecretById(svc.id);
        if (!secret) {
            serviceHealth[`${svc.type}:${svc.id}`] = false;
            serviceDetails.push(detail);
            return;
        }

            try {
                const apiKey = decryptSecret(secret.api_key_encrypted);
                let fetcher: ((path: string, init?: RequestInit) => Promise<any>) | null = null;
                if (svc.type === "radarr") fetcher = createRadarrFetcher(secret.base_url, apiKey);
                if (svc.type === "sonarr") fetcher = createSonarrFetcher(secret.base_url, apiKey);
            if (!fetcher) {
                serviceHealth[`${svc.type}:${svc.id}`] = false;
                serviceDetails.push(detail);
                return;
            }

            const statusResult = await checkService(svc.type, secret.base_url, apiKey);
            detail.healthy = statusResult.healthy;
            detail.statusText = statusResult.statusText;
            serviceHealth[`${svc.type}:${svc.id}`] = statusResult.healthy;

            try {
                const queuePath =
                    svc.type === "radarr"
                        ? "/api/v3/queue?page=1&pageSize=100&includeMovie=true"
                        : "/api/v3/queue?page=1&pageSize=100&includeSeries=true";
                const queueRes = await fetcher(queuePath);
                const records = Array.isArray(queueRes) ? queueRes : queueRes?.records || [];
                const total = Array.isArray(queueRes)
                    ? queueRes.length
                    : (queueRes?.totalRecords as number | undefined) ?? records.length;
                detail.queueSize = total;
                detail.failedCount = records.filter(isFailedQueueItem).length;
            } catch {
                // ignore queue errors to keep health response working
            }

            try {
                const roots = await fetcher("/api/v3/rootfolder");
                if (Array.isArray(roots) && roots.length > 0) {
                    const desiredPath = (svc.config as any)?.rootFolder;
                    const matched = desiredPath ? roots.find((r: any) => r?.path === desiredPath) : null;
                    const root = matched || roots[0];
                    detail.disk = {
                        path: root?.path,
                        freeBytes: root?.freeSpace ?? root?.freeSpaceBytes ?? root?.free ?? undefined,
                        totalBytes: root?.totalSpace ?? root?.totalSpaceBytes ?? root?.total ?? undefined,
                    };
                }
            } catch {
                // ignore disk errors
            }
        } catch {
            serviceHealth[`${svc.type}:${svc.id}`] = false;
        }

        serviceDetails.push(detail);
    }));

    return cacheableJsonResponseWithETag(req, {
        database: dbHealthy,
        tmdb: tmdbHealthy,
        jellyfin: jellyfinHealthy,
        services: serviceHealth,
        serviceDetails
    }, { maxAge: 0, private: true });
}
