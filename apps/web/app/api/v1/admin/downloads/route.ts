import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { listAllActiveMediaServices } from "@/lib/media-services";
import { createRadarrFetcher } from "@/lib/radarr";
import { createSonarrFetcher } from "@/lib/sonarr";
import {
    qbittorrentGetTorrents,
    qbittorrentGetTransferInfo,
    sabnzbdGetQueue,
    nzbgetListGroups,
    nzbgetGetStatus,
    type QbitTorrent,
} from "@/lib/download-clients";

export const dynamic = "force-dynamic";

// ------------------------------------------------------------------
// Normalised item shape returned to the client
// ------------------------------------------------------------------
export type NormalizedQueueItem = {
    id: string | number;
    title: string;
    mediaTitle: string;
    size: number;
    sizeLeft: number;
    progress: number; // 0–100
    speedBytesPerSec?: number;
    timeleft?: string;
    estimatedCompletionTime?: string;
    status: string;
    trackedDownloadStatus?: string;
    downloadClient?: string;
    protocol?: string;
    indexer?: string;
    errorMessage?: string;
    // Sonarr extras
    seasonNumber?: number;
    episodeNumber?: number;
    episodeTitle?: string;
};

export type ServiceQueue = {
    serviceId: number;
    serviceName: string;
    serviceType: string;
    items: NormalizedQueueItem[];
    totalRecords: number;
    // Speed info for download clients
    dlSpeedBytesPerSec?: number;
    upSpeedBytesPerSec?: number;
    error?: string;
};

function safeProgress(size: number, sizeleft: number): number {
    if (!size || size <= 0) return 0;
    const pct = ((size - sizeleft) / size) * 100;
    return Math.round(Math.min(100, Math.max(0, pct)));
}

// ------------------------------------------------------------------
// Radarr queue → NormalizedQueueItem[]
// ------------------------------------------------------------------
async function fetchRadarrQueue(baseUrl: string, apiKey: string, serviceId: number, serviceName: string): Promise<ServiceQueue> {
    try {
        const fetcher = createRadarrFetcher(baseUrl, apiKey, 12_000);
        const data: any = await fetcher("/api/v3/queue?page=1&pageSize=100&includeMovie=true&includeUnknownMovieItems=true");
        const records: any[] = Array.isArray(data?.records) ? data.records : [];
        const items: NormalizedQueueItem[] = records.map(r => ({
            id: r.id,
            title: r.title ?? "Unknown",
            mediaTitle: r.movie?.title ?? r.title ?? "Unknown",
            size: Number(r.size ?? 0),
            sizeLeft: Number(r.sizeleft ?? 0),
            progress: safeProgress(Number(r.size ?? 0), Number(r.sizeleft ?? 0)),
            timeleft: r.timeleft,
            estimatedCompletionTime: r.estimatedCompletionTime,
            status: r.status ?? "unknown",
            trackedDownloadStatus: r.trackedDownloadStatus,
            downloadClient: r.downloadClient,
            protocol: r.protocol,
            indexer: r.indexer,
            errorMessage: r.errorMessage ?? r.statusMessages?.[0]?.messages?.[0],
        }));
        return {
            serviceId,
            serviceName,
            serviceType: "radarr",
            items,
            totalRecords: Number(data?.totalRecords ?? items.length),
        };
    } catch (e: any) {
        return { serviceId, serviceName, serviceType: "radarr", items: [], totalRecords: 0, error: e?.message ?? String(e) };
    }
}

// ------------------------------------------------------------------
// Sonarr queue → NormalizedQueueItem[]
// ------------------------------------------------------------------
async function fetchSonarrQueue(baseUrl: string, apiKey: string, serviceId: number, serviceName: string): Promise<ServiceQueue> {
    try {
        const fetcher = createSonarrFetcher(baseUrl, apiKey, 12_000);
        const data: any = await fetcher("/api/v3/queue?page=1&pageSize=100&includeSeries=true&includeEpisode=true&includeUnknownSeriesItems=true");
        const records: any[] = Array.isArray(data?.records) ? data.records : [];
        const items: NormalizedQueueItem[] = records.map(r => ({
            id: r.id,
            title: r.title ?? "Unknown",
            mediaTitle: r.series?.title ?? r.title ?? "Unknown",
            size: Number(r.size ?? 0),
            sizeLeft: Number(r.sizeleft ?? 0),
            progress: safeProgress(Number(r.size ?? 0), Number(r.sizeleft ?? 0)),
            timeleft: r.timeleft,
            estimatedCompletionTime: r.estimatedCompletionTime,
            status: r.status ?? "unknown",
            trackedDownloadStatus: r.trackedDownloadStatus,
            downloadClient: r.downloadClient,
            protocol: r.protocol,
            indexer: r.indexer,
            errorMessage: r.errorMessage ?? r.statusMessages?.[0]?.messages?.[0],
            seasonNumber: r.episode?.seasonNumber,
            episodeNumber: r.episode?.episodeNumber,
            episodeTitle: r.episode?.title,
        }));
        return {
            serviceId,
            serviceName,
            serviceType: "sonarr",
            items,
            totalRecords: Number(data?.totalRecords ?? items.length),
        };
    } catch (e: any) {
        return { serviceId, serviceName, serviceType: "sonarr", items: [], totalRecords: 0, error: e?.message ?? String(e) };
    }
}

// ------------------------------------------------------------------
// qBittorrent → NormalizedQueueItem[]
// ------------------------------------------------------------------
const QBIT_ACTIVE_STATES = new Set(["downloading", "uploading", "stalledDL", "stalledUP", "checkingDL", "checkingUP", "queuedDL", "queuedUP", "pausedDL", "pausedUP", "moving", "error", "unknown"]);

function qbitStateToStatus(state: string): string {
    const map: Record<string, string> = {
        downloading: "downloading",
        uploading: "seeding",
        stalledDL: "stalled",
        stalledUP: "seeding",
        queuedDL: "queued",
        queuedUP: "queued",
        pausedDL: "paused",
        pausedUP: "paused",
        checkingDL: "checking",
        checkingUP: "checking",
        error: "failed",
        missingFiles: "failed",
        moving: "importing",
        unknown: "unknown",
    };
    return map[state] ?? state;
}

async function fetchQbittorrentQueue(
    baseUrl: string,
    apiKey: string,
    config: Record<string, unknown>,
    serviceId: number,
    serviceName: string
): Promise<ServiceQueue> {
    try {
        const [torrents, transferInfo] = await Promise.all([
            qbittorrentGetTorrents(baseUrl, apiKey, config),
            qbittorrentGetTransferInfo(baseUrl, apiKey, config).catch(() => null),
        ]);
        const activeTorrents = torrents.filter((t: QbitTorrent) => QBIT_ACTIVE_STATES.has(t.state));
        const items: NormalizedQueueItem[] = activeTorrents.map((t: QbitTorrent) => ({
            id: t.hash,
            title: t.name,
            mediaTitle: t.name,
            size: t.size,
            sizeLeft: Math.max(0, t.size - t.downloaded),
            progress: Math.round(t.progress * 100),
            speedBytesPerSec: t.dlspeed,
            timeleft: t.eta > 0 && t.eta < 864000 ? formatSeconds(t.eta) : undefined,
            status: qbitStateToStatus(t.state),
            protocol: "torrent",
            downloadClient: "qBittorrent",
        }));
        return {
            serviceId,
            serviceName,
            serviceType: "qbittorrent",
            items,
            totalRecords: items.length,
            dlSpeedBytesPerSec: transferInfo?.dl_info_speed,
            upSpeedBytesPerSec: transferInfo?.up_info_speed,
        };
    } catch (e: any) {
        return { serviceId, serviceName, serviceType: "qbittorrent", items: [], totalRecords: 0, error: e?.message ?? String(e) };
    }
}

// ------------------------------------------------------------------
// SABnzbd → NormalizedQueueItem[]
// ------------------------------------------------------------------
async function fetchSabnzbdQueue(baseUrl: string, apiKey: string, serviceId: number, serviceName: string): Promise<ServiceQueue> {
    try {
        const data = await sabnzbdGetQueue(baseUrl, apiKey);
        const slots = data?.queue?.slots ?? [];
        const kbps = parseFloat(data?.queue?.kbpersec ?? "0");
        const items: NormalizedQueueItem[] = slots.map(s => {
            const mb = parseFloat(s.mb ?? "0");
            const mbleft = parseFloat(s.mbleft ?? "0");
            return {
                id: s.nzo_id,
                title: s.filename,
                mediaTitle: s.filename,
                size: Math.round(mb * 1024 * 1024),
                sizeLeft: Math.round(mbleft * 1024 * 1024),
                progress: parseInt(s.percentage ?? "0", 10),
                speedBytesPerSec: kbps > 0 ? Math.round(kbps * 1024) : undefined,
                timeleft: s.timeleft,
                status: s.status.toLowerCase(),
                protocol: "usenet",
                downloadClient: "SABnzbd",
            };
        });
        return {
            serviceId,
            serviceName,
            serviceType: "sabnzbd",
            items,
            totalRecords: parseInt(String(data?.queue?.noofslots_total ?? items.length), 10),
            dlSpeedBytesPerSec: kbps > 0 ? Math.round(kbps * 1024) : undefined,
        };
    } catch (e: any) {
        return { serviceId, serviceName, serviceType: "sabnzbd", items: [], totalRecords: 0, error: e?.message ?? String(e) };
    }
}

// ------------------------------------------------------------------
// nzbget → NormalizedQueueItem[]
// ------------------------------------------------------------------
async function fetchNzbgetQueue(
    baseUrl: string,
    apiKey: string,
    config: Record<string, unknown>,
    serviceId: number,
    serviceName: string
): Promise<ServiceQueue> {
    try {
        const [groups, status] = await Promise.all([
            nzbgetListGroups(baseUrl, apiKey, config),
            nzbgetGetStatus(baseUrl, apiKey, config).catch(() => null),
        ]);
        const items: NormalizedQueueItem[] = (groups ?? []).map(g => {
            const totalMb = g.FileSizeMB;
            const leftMb = g.RemainingSizeMB;
            return {
                id: g.NZBID,
                title: g.NZBName,
                mediaTitle: g.NZBName,
                size: Math.round(totalMb * 1024 * 1024),
                sizeLeft: Math.round(leftMb * 1024 * 1024),
                progress: safeProgress(totalMb, leftMb),
                speedBytesPerSec: status?.DownloadRate ?? undefined,
                status: g.Status.toLowerCase(),
                protocol: "usenet",
                downloadClient: "nzbget",
            };
        });
        return {
            serviceId,
            serviceName,
            serviceType: "nzbget",
            items,
            totalRecords: items.length,
            dlSpeedBytesPerSec: status?.DownloadRate,
        };
    } catch (e: any) {
        return { serviceId, serviceName, serviceType: "nzbget", items: [], totalRecords: 0, error: e?.message ?? String(e) };
    }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function formatSeconds(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
}

// ------------------------------------------------------------------
// Route handler
// ------------------------------------------------------------------
export async function GET() {
    const user = await getUser().catch(() => null);
    if (!user?.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const services = await listAllActiveMediaServices();
    const tasks: Promise<ServiceQueue>[] = [];

    for (const svc of services) {
        const { id, name, base_url: url, type, config: cfg } = svc;
        const cfg2 = cfg as Record<string, unknown>;
        if (type === "radarr") tasks.push(fetchRadarrQueue(url, svc.apiKey, id, name));
        else if (type === "sonarr") tasks.push(fetchSonarrQueue(url, svc.apiKey, id, name));
        else if (type === "qbittorrent") tasks.push(fetchQbittorrentQueue(url, svc.apiKey, cfg2, id, name));
        else if (type === "sabnzbd") tasks.push(fetchSabnzbdQueue(url, svc.apiKey, id, name));
        else if (type === "nzbget") tasks.push(fetchNzbgetQueue(url, svc.apiKey, cfg2, id, name));
    }

    const queues = await Promise.all(tasks);

    return NextResponse.json({ queues });
}
