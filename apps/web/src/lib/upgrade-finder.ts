import { listRadarrMovies, listRadarrQualityProfiles, createRadarrFetcher } from "@/lib/radarr";
import { getActiveMediaService } from "@/lib/media-services";
import { upsertUpgradeFinderHint } from "@/db";
import { logger } from "@/lib/logger";

export type UpgradeHintStatus = "available" | "none" | "error";

export type UpgradeFinderItem = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year?: number | null;
  currentQuality: string;
  currentSizeBytes?: number;
  targetQuality?: string;
  upgradeStatus: "missing" | "upgrade" | "partial" | "up-to-date";
  episodeFileCount?: number;
  totalEpisodeCount?: number;
  interactiveUrl?: string;
  hintStatus?: UpgradeHintStatus | "checking" | "idle";
  hintText?: string | null;
  checkedAt?: string | null;
};

function resolveProfileCutoffName(profileId: number | null | undefined, profiles: any[]) {
  if (!profileId || !Array.isArray(profiles)) return undefined;
  const profile = profiles.find((p: any) => p?.id === profileId);
  if (!profile) return undefined;
  const cutoffId = profile?.cutoff;
  const items = Array.isArray(profile?.items) ? profile.items : [];
  const cutoffItem = items.find((item: any) => item?.quality?.id === cutoffId || item?.id === cutoffId);
  return cutoffItem?.quality?.name ?? profile?.name ?? undefined;
}

export async function listUpgradeFinderItems(): Promise<UpgradeFinderItem[]> {
  const [radarrMovies, radarrProfiles] = await Promise.all([
    listRadarrMovies().catch(() => []),
    listRadarrQualityProfiles().catch(() => [])
  ]);

  const movieItems: UpgradeFinderItem[] = (radarrMovies as any[]).map(movie => {
    const file = movie?.movieFile ?? null;
    const hasFile = Boolean(movie?.hasFile ?? file);
    const qualityName = file?.quality?.quality?.name ?? (hasFile ? "Unknown" : "Missing");
    const cutoffNotMet = Boolean(file?.qualityCutoffNotMet);
    const upgradeStatus = !hasFile
      ? "missing"
      : cutoffNotMet
      ? "upgrade"
      : "up-to-date";

    return {
      id: movie?.id,
      mediaType: "movie",
      title: movie?.title ?? "Untitled",
      year: movie?.year ?? null,
      currentQuality: qualityName,
      currentSizeBytes: file?.size ?? file?.sizeBytes,
      targetQuality: resolveProfileCutoffName(movie?.qualityProfileId, radarrProfiles as any[]),
      upgradeStatus
    };
  });

  return movieItems;
}

function extractReleaseTitle(release: any) {
  return String(release?.title ?? release?.releaseTitle ?? "");
}

function extractQualityName(release: any) {
  return String(release?.quality?.quality?.name ?? release?.quality?.name ?? "");
}

function releaseLooks4k(release: any) {
  const title = extractReleaseTitle(release).toLowerCase();
  const quality = extractQualityName(release).toLowerCase();
  return title.includes("2160") || title.includes("4k") || quality.includes("2160") || quality.includes("4k");
}

export async function getUpgradeFinderReleases(mediaType: "movie" | "tv", id: number) {
  // Only movies are supported for upgrade finder
  if (mediaType !== "movie") {
    throw new Error("Only movies are supported for upgrade finder");
  }

  // Release endpoint queries all indexers and can be very slow - use 2 minute timeout
  const releaseTimeout = 120000;
  const service = await getActiveMediaService("radarr");
  if (!service) throw new Error("No Radarr service configured");
  const fetcher = createRadarrFetcher(service.base_url, service.apiKey, releaseTimeout);
  const releases = await fetcher(`/api/v3/release?movieId=${id}`);
  return Array.isArray(releases) ? releases : [];
}

export async function checkUpgradeHintForItem(mediaType: "movie" | "tv", id: number) {
  // Only movies are supported
  if (mediaType !== "movie") {
    throw new Error("Only movies are supported for upgrade finder");
  }

  try {
    const releases = await getUpgradeFinderReleases(mediaType, id);
    const has4k = releases.some(releaseLooks4k);
    const hintText = has4k ? "4K available" : "No 4K found";
    await upsertUpgradeFinderHint({
      mediaType,
      mediaId: id,
      status: has4k ? "available" : "none",
      hintText
    });
    return { status: has4k ? "available" : "none", hintText, count: releases.length } as const;
  } catch (err: any) {
    logger.warn("[UpgradeFinder] Hint check failed", {
      mediaType,
      id,
      error: err?.message ?? String(err)
    });
    await upsertUpgradeFinderHint({
      mediaType,
      mediaId: id,
      status: "error",
      hintText: null
    });
    return { status: "error", hintText: "Check failed", count: 0 } as const;
  }
}

export async function refreshUpgradeHintsForAll() {
  const items = await listUpgradeFinderItems();
  // Only process movies (all items are movies now, but being explicit)
  const movieItems = items.filter(item => item.mediaType === "movie");

  const concurrency = 2; // Reduced from 4 to be gentler on services
  let processed = 0;
  let available = 0;
  let errored = 0;

  for (let i = 0; i < movieItems.length; i += concurrency) {
    const batch = movieItems.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(item => checkUpgradeHintForItem(item.mediaType, item.id)));
    results.forEach(result => {
      processed += 1;
      if (result.status === "available") available += 1;
      if (result.status === "error") errored += 1;
    });

    // Add a small delay between batches to avoid overwhelming services
    if (i + concurrency < movieItems.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return { processed, available, errored };
}

export function mapReleaseToRow(release: any) {
  return {
    guid: release?.guid ?? release?.downloadUrl ?? "",
    indexerId: release?.indexerId ?? null,
    title: extractReleaseTitle(release),
    indexer: release?.indexer ?? release?.indexerName ?? "",
    protocol: release?.protocol ?? "",
    downloadUrl: release?.downloadUrl ?? "",
    size: release?.size ?? release?.sizeBytes ?? null,
    age: release?.age ?? null,
    seeders: release?.seeders ?? null,
    leechers: release?.leechers ?? null,
    quality: extractQualityName(release),
    language: release?.languages?.[0]?.name ?? release?.language?.name ?? "",
    rejected: Array.isArray(release?.rejections) ? release.rejections.map((r: any) => r?.reason || r) : []
  };
}
