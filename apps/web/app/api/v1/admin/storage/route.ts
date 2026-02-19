import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { listActiveMediaServicesOfType } from "@/lib/media-services";
import { createRadarrFetcher } from "@/lib/radarr";
import { createSonarrFetcher } from "@/lib/sonarr";

export const dynamic = "force-dynamic";

export type DiskEntry = {
    path: string;
    label: string;
    freeSpace: number;
    totalSpace: number;
    usedSpace: number;
    usedPercent: number;
};

export type RootFolder = {
    path: string;
    freeSpace: number;
    accessible: boolean;
};

export type ServiceStorage = {
    serviceId: number;
    serviceName: string;
    serviceType: "radarr" | "sonarr";
    diskSpace: DiskEntry[];
    rootFolders: RootFolder[];
    error?: string;
};

function normalizeDisk(raw: any): DiskEntry {
    const free = Number(raw.freeSpace ?? 0);
    const total = Number(raw.totalSpace ?? raw.totalSize ?? 0);
    const used = total > 0 ? total - free : 0;
    const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;
    return {
        path: String(raw.path ?? "/"),
        label: String(raw.label ?? raw.path ?? "/"),
        freeSpace: free,
        totalSpace: total,
        usedSpace: used,
        usedPercent,
    };
}

async function fetchServiceStorage(
    type: "radarr" | "sonarr",
    baseUrl: string,
    apiKey: string,
    serviceId: number,
    serviceName: string
): Promise<ServiceStorage> {
    try {
        const fetcher = type === "radarr"
            ? createRadarrFetcher(baseUrl, apiKey, 12_000)
            : createSonarrFetcher(baseUrl, apiKey, 12_000);

        const [diskRaw, rootRaw] = await Promise.all([
            fetcher("/api/v3/diskspace").catch(() => []),
            fetcher("/api/v3/rootfolder").catch(() => []),
        ]);

        const disks: DiskEntry[] = Array.isArray(diskRaw)
            ? diskRaw.map(normalizeDisk)
            : [];

        const rootFolders: RootFolder[] = Array.isArray(rootRaw)
            ? rootRaw.map((r: any) => ({
                path: String(r.path ?? ""),
                freeSpace: Number(r.freeSpace ?? 0),
                accessible: Boolean(r.accessible ?? true),
            }))
            : [];

        return { serviceId, serviceName, serviceType: type, diskSpace: disks, rootFolders };
    } catch (e: any) {
        return {
            serviceId,
            serviceName,
            serviceType: type,
            diskSpace: [],
            rootFolders: [],
            error: e?.message ?? String(e),
        };
    }
}

export async function GET() {
    const user = await getUser().catch(() => null);
    if (!user?.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [radarrServices, sonarrServices] = await Promise.all([
        listActiveMediaServicesOfType("radarr"),
        listActiveMediaServicesOfType("sonarr"),
    ]);

    const tasks: Promise<ServiceStorage>[] = [
        ...radarrServices.map(s => fetchServiceStorage("radarr", s.base_url, s.apiKey, s.id, s.name)),
        ...sonarrServices.map(s => fetchServiceStorage("sonarr", s.base_url, s.apiKey, s.id, s.name)),
    ];

    const services = await Promise.all(tasks);

    // Build a deduplicated cross-service disk summary (same physical disk via same path)
    const diskMap = new Map<string, DiskEntry & { seenBy: string[] }>();
    for (const svc of services) {
        for (const d of svc.diskSpace) {
            const key = d.path;
            if (!diskMap.has(key)) {
                diskMap.set(key, { ...d, seenBy: [svc.serviceName] });
            } else {
                diskMap.get(key)!.seenBy.push(svc.serviceName);
            }
        }
    }

    return NextResponse.json({
        services,
        summary: Array.from(diskMap.values()),
    });
}
