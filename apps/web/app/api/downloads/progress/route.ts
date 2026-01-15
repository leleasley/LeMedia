import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { radarrQueue } from "@/lib/radarr";
import { sonarrQueue } from "@/lib/sonarr";

export interface DownloadProgress {
  id: number;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  status: string;
  sizeleft: number;
  size: number;
  timeleft: string | null;
  estimatedCompletionTime: string | null;
  percentComplete: number;
  downloadId: string;
  protocol: string;
  downloadClient: string;
  indexer: string;
  outputPath: string;
  errorMessage?: string;
  isImporting?: boolean;
}

async function getRadarrDownloads(): Promise<DownloadProgress[]> {
  try {
    const queue: any = await radarrQueue(1, 100);
    const records = queue?.records || [];
    
    return records
      .filter((item: any) => item.movie)
      .map((item: any) => {
        const sizeleft = item.sizeleft || 0;
        const size = item.size || 1;
        const percentComplete = size > 0 ? ((size - sizeleft) / size) * 100 : 0;
        const isImporting = item.status === "importing" || item.status === "completed";
        
        return {
          id: item.id,
          tmdbId: item.movie?.tmdbId || 0,
          type: "movie" as const,
          title: item.movie?.title || item.title || "Unknown",
          status: item.status || "downloading",
          sizeleft,
          size,
          timeleft: item.timeleft || null,
          estimatedCompletionTime: item.estimatedCompletionTime || null,
          percentComplete: Math.round(percentComplete * 10) / 10,
          downloadId: item.downloadId || "",
          protocol: item.protocol || "unknown",
          downloadClient: item.downloadClient || "unknown",
          indexer: item.indexer || "unknown",
          outputPath: item.outputPath || "",
          errorMessage: item.errorMessage,
          isImporting,
        };
      });
  } catch (error) {
    console.error("[Download Progress] Radarr error:", error);
    return [];
  }
}

async function getSonarrDownloads(): Promise<DownloadProgress[]> {
  try {
    const queue: any = await sonarrQueue(1, 100);
    const records = queue?.records || [];
    
    return records
      .filter((item: any) => item.series)
      .map((item: any) => {
        const sizeleft = item.sizeleft || 0;
        const size = item.size || 1;
        const percentComplete = size > 0 ? ((size - sizeleft) / size) * 100 : 0;
        const isImporting = item.status === "importing" || item.status === "completed";
        
        return {
          id: item.id,
          tmdbId: item.series?.tvdbId || 0,
          type: "tv" as const,
          title: item.series?.title || item.title || "Unknown",
          status: item.status || "downloading",
          sizeleft,
          size,
          timeleft: item.timeleft || null,
          estimatedCompletionTime: item.estimatedCompletionTime || null,
          percentComplete: Math.round(percentComplete * 10) / 10,
          downloadId: item.downloadId || "",
          protocol: item.protocol || "unknown",
          downloadClient: item.downloadClient || "unknown",
          indexer: item.indexer || "unknown",
          outputPath: item.outputPath || "",
          errorMessage: item.errorMessage,
          isImporting,
        };
      });
  } catch (error) {
    console.error("[Download Progress] Sonarr error:", error);
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    await getUser();
    
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type");
    const tmdbId = searchParams.get("tmdbId");
    
    let downloads: DownloadProgress[] = [];
    
    const [radarrDownloads, sonarrDownloads] = await Promise.all([
      getRadarrDownloads(),
      getSonarrDownloads()
    ]);
    
    downloads = [...radarrDownloads, ...sonarrDownloads];

    if (type && tmdbId) {
      const id = parseInt(tmdbId, 10);
      if (isNaN(id)) {
        return NextResponse.json({ error: "Invalid tmdbId parameter" }, { status: 400 });
      }
      downloads = downloads.filter(d =>
        d.type === type && d.tmdbId === id
      );
    } else if (type) {
      downloads = downloads.filter(d => d.type === type);
    } else if (tmdbId) {
      const id = parseInt(tmdbId, 10);
      if (isNaN(id)) {
        return NextResponse.json({ error: "Invalid tmdbId parameter" }, { status: 400 });
      }
      downloads = downloads.filter(d => d.tmdbId === id);
    }
    
    return NextResponse.json({ downloads });
  } catch (error) {
    console.error("[Download Progress] Error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
