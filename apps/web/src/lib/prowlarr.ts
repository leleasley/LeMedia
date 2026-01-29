import { baseFetch } from "@/lib/fetch-utils";
import { ActiveMediaService, getActiveMediaService } from "@/lib/media-services";

const normalizeUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, "");

export function createProwlarrFetcher(baseUrl: string, apiKey: string, timeoutOverride?: number) {
  const root = normalizeUrl(baseUrl);
  return (path: string, init?: RequestInit) => baseFetch(root, path, apiKey, init, "Prowlarr", timeoutOverride);
}

export async function prowlarrStatus() {
  const service = await getActiveMediaService("prowlarr");
  if (!service) {
    throw new Error("No Prowlarr service configured");
  }
  const fetcher = createProwlarrFetcher(service.base_url, service.apiKey);
  return fetcher("/api/v1/system/status");
}

export async function listProwlarrIndexers() {
  const service = await getActiveMediaService("prowlarr");
  if (!service) {
    throw new Error("No Prowlarr service configured");
  }
  const fetcher = createProwlarrFetcher(service.base_url, service.apiKey);
  const response = await fetcher("/api/v1/indexer");
  return Array.isArray(response) ? response : [];
}

export async function searchProwlarr(
  query: string,
  service?: ActiveMediaService,
  timeoutOverride?: number,
  options?: {
    type?: "movie" | "tv";
    categories?: number[];
    limit?: number;
  }
) {
  const activeService = service ?? await getActiveMediaService("prowlarr");
  if (!activeService) {
    throw new Error("No Prowlarr service configured");
  }
  const fetcher = createProwlarrFetcher(activeService.base_url, activeService.apiKey, timeoutOverride);

  // Build query parameters
  const params = new URLSearchParams({ query });

  // Add type-specific categories if specified
  if (options?.type === "movie") {
    // 2000 = Movies, 2030 = Movies/HD, 2040 = Movies/UHD, 2045 = Movies/BluRay, 2050 = Movies/3D
    [2000, 2030, 2040, 2045, 2050].forEach((category) => {
      params.append("categories", String(category));
    });
  } else if (options?.type === "tv") {
    // 5000 = TV, 5030 = TV/HD, 5040 = TV/UHD
    [5000, 5030, 5040].forEach((category) => {
      params.append("categories", String(category));
    });
  } else if (options?.categories) {
    options.categories.forEach((category) => {
      params.append("categories", String(category));
    });
  }

  if (options?.type) {
    params.set("type", options.type);
  }

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const response = await fetcher(`/api/v1/search?${params.toString()}`);
  return Array.isArray(response) ? response : [];
}

export function mapProwlarrResultToRow(release: any) {
  const title = String(release?.title ?? release?.releaseTitle ?? "");
  const quality = String(release?.quality?.quality?.name ?? release?.quality?.name ?? "");
  return {
    guid: release?.guid ?? release?.downloadUrl ?? "",
    downloadUrl: release?.downloadUrl ?? release?.downloadUri ?? null,
    indexerId: release?.indexerId ?? null,
    title,
    indexer: release?.indexer ?? release?.indexerName ?? "",
    protocol: String(release?.protocol ?? release?.downloadProtocol ?? ""),
    infoUrl: release?.infoUrl ?? release?.indexerUrl ?? "",
    size: release?.size ?? release?.sizeBytes ?? null,
    age: release?.age ?? null,
    seeders: release?.seeders ?? null,
    leechers: release?.leechers ?? null,
    quality,
    language: release?.language ?? release?.languages?.[0]?.name ?? "",
    rejected: Array.isArray(release?.rejections) ? release.rejections.map((r: any) => r?.reason || r) : [],
    history: []
  };
}
