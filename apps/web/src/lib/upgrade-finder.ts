import { listRadarrMovies, listRadarrQualityProfiles } from "@/lib/radarr";
import { listSeries, listSonarrQualityProfiles } from "@/lib/sonarr";

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
  const [radarrMovies, sonarrSeries, radarrProfiles, sonarrProfiles] = await Promise.all([
    listRadarrMovies().catch(() => []),
    listSeries().catch(() => []),
    listRadarrQualityProfiles().catch(() => []),
    listSonarrQualityProfiles().catch(() => [])
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

  const seriesItems: UpgradeFinderItem[] = (sonarrSeries as any[]).map(series => {
    const stats = series?.statistics ?? {};
    const episodeFileCount = Number(stats?.episodeFileCount ?? 0);
    const totalEpisodeCount = Number(stats?.totalEpisodeCount ?? 0);
    const hasAnyFile = episodeFileCount > 0;
    const qualityCutoffNotMet = Boolean(stats?.qualityCutoffNotMet);

    let upgradeStatus: UpgradeFinderItem["upgradeStatus"] = "up-to-date";
    if (!hasAnyFile) {
      upgradeStatus = "missing";
    } else if (qualityCutoffNotMet) {
      upgradeStatus = "upgrade";
    } else if (totalEpisodeCount > 0 && episodeFileCount < totalEpisodeCount) {
      upgradeStatus = "partial";
    }

    return {
      id: series?.id,
      mediaType: "tv",
      title: series?.title ?? "Untitled",
      year: series?.year ?? null,
      currentQuality: hasAnyFile ? "Mixed" : "Missing",
      currentSizeBytes: stats?.sizeOnDisk,
      targetQuality: resolveProfileCutoffName(series?.qualityProfileId, sonarrProfiles as any[]),
      upgradeStatus,
      episodeFileCount,
      totalEpisodeCount
    };
  });

  return [...movieItems, ...seriesItems];
}
