import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getUpgradeFinderReleases, mapReleaseToRow } from "@/lib/upgrade-finder";
import { getActiveMediaService } from "@/lib/media-services";
import { createRadarrFetcher } from "@/lib/radarr";

export const dynamic = "force-dynamic";

const RELEASE_CACHE_TTL_MS = 2 * 60 * 1000;
const releasesCache = new Map<string, { items: ReturnType<typeof mapReleaseToRow>[]; total: number; expiresAt: number }>();
let cachedUltraHdProfileId: { id: number; expiresAt: number } | null = null;

function normalizeHistoryTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

async function fetchRadarrHistoryForMovie(fetcher: (path: string, init?: RequestInit) => Promise<any>, movieId: number) {
  try {
    const response = await fetcher(`/api/v3/history/movie?movieId=${movieId}&page=1&pageSize=200`);
    return Array.isArray(response?.records) ? response.records : Array.isArray(response) ? response : [];
  } catch {
    const response = await fetcher(`/api/v3/history?movieId=${movieId}&page=1&pageSize=200`);
    return Array.isArray(response?.records) ? response.records : Array.isArray(response) ? response : [];
  }
}

const QuerySchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  id: z.coerce.number().int(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

async function getUltraHdProfileId(fetcher: (path: string, init?: RequestInit) => Promise<any>) {
  const now = Date.now();
  if (cachedUltraHdProfileId && cachedUltraHdProfileId.expiresAt > now) {
    return cachedUltraHdProfileId.id;
  }
  const profiles = await fetcher("/api/v3/qualityprofile");
  const ultraHdProfile = Array.isArray(profiles)
    ? profiles.find((p: any) => p.name === "Ultra-HD")
    : null;
  if (!ultraHdProfile) return null;
  cachedUltraHdProfileId = { id: ultraHdProfile.id, expiresAt: now + RELEASE_CACHE_TTL_MS };
  return ultraHdProfile.id;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const parsed = QuerySchema.safeParse({
    mediaType: req.nextUrl.searchParams.get("mediaType"),
    id: req.nextUrl.searchParams.get("id"),
    offset: req.nextUrl.searchParams.get("offset") ?? "0",
    limit: req.nextUrl.searchParams.get("limit") ?? "50"
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }

  // Only movies are supported
  if (parsed.data.mediaType !== "movie") {
    return NextResponse.json({ error: "Only movies are supported for upgrade finder" }, { status: 400 });
  }

  try {
    const cacheKey = `${parsed.data.mediaType}:${parsed.data.id}`;
    const cached = releasesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const start = parsed.data.offset;
      const end = start + parsed.data.limit;
      return NextResponse.json({
        items: cached.items.slice(start, end),
        total: cached.total,
        offset: parsed.data.offset,
        limit: parsed.data.limit,
        cached: true
      });
    }

    const service = await getActiveMediaService("radarr");
    if (!service) return NextResponse.json({ error: "No Radarr service configured" }, { status: 400 });
    const fetcher = createRadarrFetcher(service.base_url, service.apiKey);

    // Get the movie and profiles
    const movie = await fetcher(`/api/v3/movie/${parsed.data.id}`);

    const originalProfileId = movie.qualityProfileId;

    const ultraHdProfileId = await getUltraHdProfileId(fetcher);
    if (!ultraHdProfileId) {
      return NextResponse.json({ error: "Ultra-HD quality profile not found in Radarr" }, { status: 400 });
    }

    let releases: any[] = [];
    let restoredProfile = false;

    try {
      // Temporarily switch to Ultra-HD profile
      if (originalProfileId !== ultraHdProfileId) {
        await fetcher(`/api/v3/movie/${parsed.data.id}`, {
          method: "PUT",
          body: JSON.stringify({
            ...movie,
            qualityProfileId: ultraHdProfileId
          })
        });
      }

      // Fetch releases with Ultra-HD profile active
      releases = await getUpgradeFinderReleases(parsed.data.mediaType, parsed.data.id);

      // Restore original profile
      if (originalProfileId !== ultraHdProfileId) {
        await fetcher(`/api/v3/movie/${parsed.data.id}`, {
          method: "PUT",
          body: JSON.stringify({
            ...movie,
            qualityProfileId: originalProfileId
          })
        });
        restoredProfile = true;
      }
    } catch (err) {
      // Restore profile even on error
      if (originalProfileId !== ultraHdProfileId && !restoredProfile) {
        try {
          await fetcher(`/api/v3/movie/${parsed.data.id}`, {
            method: "PUT",
            body: JSON.stringify({
              ...movie,
              qualityProfileId: originalProfileId
            })
          });
        } catch (restoreErr) {
          console.error("Failed to restore profile:", restoreErr);
        }
      }
      throw err;
    }

    let items = releases.map(mapReleaseToRow).filter((item) => {
      const protocol = String(item.protocol ?? "").toLowerCase();
      return protocol !== "torrent";
    });

    const historyRecords = await fetchRadarrHistoryForMovie(fetcher, parsed.data.id).catch(() => []);
    if (historyRecords.length > 0) {
      const historyMap = new Map<string, Array<{ date: string | null; eventType: string | number | null; source: string | null }>>();
      historyRecords.forEach((entry: any) => {
        const title = String(entry?.sourceTitle ?? entry?.title ?? entry?.releaseTitle ?? "");
        const key = normalizeHistoryTitle(title);
        if (!key) return;
        const list = historyMap.get(key) ?? [];
        list.push({
          date: entry?.date ?? entry?.dateUtc ?? null,
          eventType: entry?.eventType ?? entry?.eventTypeName ?? entry?.eventTypeId ?? null,
          source: entry?.downloadClient ?? entry?.source ?? null
        });
        historyMap.set(key, list);
      });

      items = items.map((item) => {
        if (item.history && item.history.length > 0) return item;
        const key = normalizeHistoryTitle(item.title);
        const history = historyMap.get(key);
        return history ? { ...item, history } : item;
      });
    }

    const total = items.length;
    const start = parsed.data.offset;
    const end = start + parsed.data.limit;
    releasesCache.set(cacheKey, { items, total, expiresAt: Date.now() + RELEASE_CACHE_TTL_MS });
    return NextResponse.json({
      items: items.slice(start, end),
      total,
      offset: parsed.data.offset,
      limit: parsed.data.limit
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load releases" }, { status: 500 });
  }
}
