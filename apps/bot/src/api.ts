const BASE_URL = process.env.INTERNAL_APP_BASE_URL ?? "http://lemedia-web:3010";

export interface SearchResult {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: number | null;
  releaseDate: string | null;
  firstAirDate: string | null;
  overview: string | null;
  posterPath: string | null;
  requestStatus: string | null;
  available: boolean;
  voteAverage: number | null;
}

export interface FollowedMediaItem {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  theatricalReleaseDate: string | null;
  digitalReleaseDate: string | null;
  notifyOnTheatrical: boolean;
  notifyOnDigital: boolean;
  notifiedTheatricalAt: string | null;
  notifiedDigitalAt: string | null;
  createdAt: string;
}

export interface RequestItem {
  id: number;
  title: string;
  status: string;
  requestType: string;
  createdAt: string;
  tmdbId?: number;
}

export interface ServiceDetail {
  name: string;
  type: string;
  healthy: boolean;
  enabled: boolean;
  statusText?: string;
  queueSize?: number;
  failedCount?: number;
}

async function apiFetch(path: string, apiToken: string, options: RequestInit = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
      ...(options.headers ?? {})
    }
  });
}

export async function searchMedia(query: string, apiToken: string): Promise<SearchResult[]> {
  const res = await apiFetch(
    `/api/tmdb/search?q=${encodeURIComponent(query)}&type=all`,
    apiToken
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  // Response shape: { results: { results: [...], errors: [] } }
  const outer = (data as any)?.results;
  const results = Array.isArray(outer?.results) ? outer.results
    : Array.isArray(outer) ? outer
    : [];

  return results
    .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 5)
    .map((r: any) => ({
      id: r.id,
      mediaType: r.media_type as "movie" | "tv",
      title: (r.title ?? r.name ?? "Unknown") as string,
      year: r.release_date
        ? parseInt(r.release_date.slice(0, 4))
        : r.first_air_date
          ? parseInt(r.first_air_date.slice(0, 4))
          : null,
      releaseDate: r.release_date ?? null,
      firstAirDate: r.first_air_date ?? null,
      overview: r.overview ?? null,
      posterPath: r.poster_path ?? null,
      requestStatus: r.request_status ?? null,
      available: !!(r.available_in_jellyfin ?? r.available),
      voteAverage: typeof r.vote_average === "number" ? parseFloat(r.vote_average.toFixed(1)) : null
    }));
}

export async function listFollowing(apiToken: string): Promise<FollowedMediaItem[]> {
  const res = await apiFetch("/api/following", apiToken);
  if (!res.ok) throw new Error(`Failed to fetch following: ${res.status}`);
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const items = Array.isArray((body as any)?.items) ? (body as any).items : [];
  return items.map((item: any) => ({
    id: String(item.id),
    mediaType: item.mediaType === "tv" ? "tv" : "movie",
    tmdbId: Number(item.tmdbId),
    title: String(item.title ?? "Unknown"),
    posterPath: item.posterPath ? String(item.posterPath) : null,
    theatricalReleaseDate: item.theatricalReleaseDate ? String(item.theatricalReleaseDate) : null,
    digitalReleaseDate: item.digitalReleaseDate ? String(item.digitalReleaseDate) : null,
    notifyOnTheatrical: Boolean(item.notifyOnTheatrical),
    notifyOnDigital: Boolean(item.notifyOnDigital),
    notifiedTheatricalAt: item.notifiedTheatricalAt ? String(item.notifiedTheatricalAt) : null,
    notifiedDigitalAt: item.notifiedDigitalAt ? String(item.notifiedDigitalAt) : null,
    createdAt: String(item.createdAt ?? ""),
  }));
}

export async function followMedia(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  notifyOnTheatrical?: boolean;
  notifyOnDigital?: boolean;
}, apiToken: string): Promise<{ ok: boolean; item?: FollowedMediaItem; message?: string }> {
  const res = await apiFetch("/api/following", apiToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, message: String((body as any)?.error ?? "Failed to follow media") };
  }
  const item = (body as any)?.item;
  return {
    ok: true,
    item: item
      ? {
        id: String(item.id),
        mediaType: item.mediaType === "tv" ? "tv" : "movie",
        tmdbId: Number(item.tmdbId),
        title: String(item.title ?? "Unknown"),
        posterPath: item.posterPath ? String(item.posterPath) : null,
        theatricalReleaseDate: item.theatricalReleaseDate ? String(item.theatricalReleaseDate) : null,
        digitalReleaseDate: item.digitalReleaseDate ? String(item.digitalReleaseDate) : null,
        notifyOnTheatrical: Boolean(item.notifyOnTheatrical),
        notifyOnDigital: Boolean(item.notifyOnDigital),
        notifiedTheatricalAt: item.notifiedTheatricalAt ? String(item.notifiedTheatricalAt) : null,
        notifiedDigitalAt: item.notifiedDigitalAt ? String(item.notifiedDigitalAt) : null,
        createdAt: String(item.createdAt ?? ""),
      }
      : undefined,
  };
}

export async function unfollowMedia(input: {
  id?: string;
  mediaType?: "movie" | "tv";
  tmdbId?: number;
}, apiToken: string): Promise<{ ok: boolean; message?: string }> {
  const res = await apiFetch("/api/following", apiToken, {
    method: "DELETE",
    body: JSON.stringify(input),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: false, message: String((body as any)?.error ?? "Failed to unfollow media") };
}

export async function getFollowingStatus(
  mediaType: "movie" | "tv",
  tmdbId: number,
  apiToken: string
): Promise<{ followed: boolean; item?: FollowedMediaItem | null }> {
  const res = await apiFetch(`/api/following/status?mediaType=${mediaType}&tmdbId=${tmdbId}`, apiToken);
  if (!res.ok) throw new Error(`Failed to fetch follow status: ${res.status}`);
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const item = (body as any)?.item;
  return {
    followed: Boolean((body as any)?.followed),
    item: item
      ? {
        id: String(item.id),
        mediaType: item.mediaType === "tv" ? "tv" : "movie",
        tmdbId: Number(item.tmdbId),
        title: String(item.title ?? "Unknown"),
        posterPath: item.posterPath ? String(item.posterPath) : null,
        theatricalReleaseDate: item.theatricalReleaseDate ? String(item.theatricalReleaseDate) : null,
        digitalReleaseDate: item.digitalReleaseDate ? String(item.digitalReleaseDate) : null,
        notifyOnTheatrical: Boolean(item.notifyOnTheatrical),
        notifyOnDigital: Boolean(item.notifyOnDigital),
        notifiedTheatricalAt: item.notifiedTheatricalAt ? String(item.notifiedTheatricalAt) : null,
        notifiedDigitalAt: item.notifiedDigitalAt ? String(item.notifiedDigitalAt) : null,
        createdAt: String(item.createdAt ?? ""),
      }
      : null,
  };
}

export async function getMovieReleaseInfo(
  tmdbId: number,
  apiToken: string
): Promise<{ theatricalReleaseDate: string | null; digitalReleaseDate: string | null }> {
  const [movieRes, mediaInfoRes] = await Promise.all([
    apiFetch(`/api/tmdb/movie/${tmdbId}`, apiToken),
    apiFetch(`/api/media-info/movie/${tmdbId}`, apiToken),
  ]);

  let theatricalReleaseDate: string | null = null;
  let digitalReleaseDate: string | null = null;

  if (movieRes.ok) {
    const movie = await movieRes.json().catch(() => ({})) as Record<string, unknown>;
    theatricalReleaseDate = typeof movie.release_date === "string" ? movie.release_date : null;
  }

  if (mediaInfoRes.ok) {
    const media = await mediaInfoRes.json().catch(() => ({})) as Record<string, unknown>;
    digitalReleaseDate = typeof (media as any).digitalReleaseDate === "string" ? String((media as any).digitalReleaseDate) : null;
  }

  return { theatricalReleaseDate, digitalReleaseDate };
}

export async function requestMovie(tmdbId: number, apiToken: string): Promise<{ ok: boolean; message: string }> {
  const res = await apiFetch("/api/v1/request", apiToken, {
    method: "POST",
    body: JSON.stringify({ mediaType: "movie", mediaId: tmdbId })
  });
  if (res.status === 409) return { ok: false, message: "already_requested" };
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: false, message: String((body as any)?.message ?? (body as any)?.error ?? "Request failed") };
  }
  return { ok: true, message: "success" };
}

export async function requestTv(tmdbId: number, apiToken: string): Promise<{ ok: boolean; message: string }> {
  const res = await apiFetch("/api/v1/request", apiToken, {
    method: "POST",
    body: JSON.stringify({ mediaType: "tv", mediaId: tmdbId })
  });
  if (res.status === 409) return { ok: false, message: "already_requested" };
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: false, message: String((body as any)?.message ?? (body as any)?.error ?? "Request failed") };
  }
  return { ok: true, message: "success" };
}

export async function getMyRequests(apiToken: string): Promise<RequestItem[]> {
  // /api/v1/request GET supports Bearer token and auto-scopes to the token owner
  const res = await apiFetch("/api/v1/request?take=8", apiToken);
  if (!res.ok) throw new Error(`Failed to fetch requests: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  return results.map((r: any) => ({
    id: r.id,
    title: r.title ?? r.media?.title ?? "Unknown",
    status: r.statusText ?? r.status ?? "unknown",
    requestType: r.mediaType ?? r.requestType ?? r.request_type ?? r.type ?? "unknown",
    createdAt: r.createdAt ?? r.created_at ?? "",
    tmdbId: r.tmdbId ?? r.tmdb_id ?? null
  }));
}

export async function getServiceHealth(apiToken: string): Promise<ServiceDetail[]> {
  // Uses the admin health endpoint which checks all configured services
  const res = await apiFetch("/api/admin/status/health", apiToken);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;

  const details: any[] = Array.isArray((data as any)?.serviceDetails) ? (data as any).serviceDetails : [];

  // Also include jellyfin from top-level
  const services: ServiceDetail[] = [];

  if ((data as any)?.jellyfin !== undefined) {
    services.push({
      name: "Jellyfin",
      type: "jellyfin",
      healthy: !!(data as any).jellyfin,
      enabled: true
    });
  }

  for (const svc of details) {
    if (!svc?.enabled) continue;
    services.push({
      name: svc.name ?? svc.type ?? "Unknown",
      type: svc.type ?? "unknown",
      healthy: !!svc.healthy,
      enabled: true,
      statusText: svc.statusText,
      queueSize: svc.queueSize ?? 0,
      failedCount: svc.failedCount ?? 0
    });
  }

  return services;
}

export async function getPendingRequests(apiToken: string): Promise<RequestItem[]> {
  const res = await apiFetch("/api/v1/request?filter=pending&take=10", apiToken);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  return results.map((r: any) => ({
    id: r.id,
    title: r.title ?? r.media?.title ?? "Unknown",
    status: r.statusText ?? r.status ?? "pending",
    requestType: r.mediaType ?? r.requestType ?? r.request_type ?? r.type ?? "unknown",
    createdAt: r.createdAt ?? r.created_at ?? "",
    tmdbId: r.tmdbId ?? r.tmdb_id ?? null
  }));
}


export async function approveRequest(requestId: string, apiToken: string): Promise<{ ok: boolean; message: string }> {
  const res = await apiFetch(`/api/v1/request/${encodeURIComponent(requestId)}`, apiToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "approved" })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: false, message: String((body as any)?.error ?? "Failed") };
  }
  return { ok: true, message: "approved" };
}

export async function denyRequest(requestId: string, apiToken: string): Promise<{ ok: boolean; message: string }> {
  const res = await apiFetch(`/api/v1/request/${encodeURIComponent(requestId)}`, apiToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "denied" })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: false, message: String((body as any)?.error ?? "Failed") };
  }
  return { ok: true, message: "denied" };
}

export interface TrendingItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: number | null;
  voteAverage: number | null;
  overview: string | null;
}

export async function getTrending(mediaType: "movie" | "tv", apiToken: string): Promise<TrendingItem[]> {
  const path = mediaType === "movie" ? "/api/tmdb/movie/popular" : "/api/tmdb/tv/popular";
  const res = await apiFetch(path, apiToken);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  return results.slice(0, 8).map((r: any) => ({
    id: r.id,
    mediaType,
    title: (r.title ?? r.name ?? "Unknown") as string,
    year: r.release_date ? parseInt(r.release_date.slice(0, 4))
      : r.first_air_date ? parseInt(r.first_air_date.slice(0, 4))
      : null,
    voteAverage: typeof r.vote_average === "number" ? parseFloat(r.vote_average.toFixed(1)) : null,
    overview: r.overview ?? null,
  }));
}

export interface NewStuffItem {
  id: number;
  title: string;
  year: string;
  type: "movie" | "tv";
  available: boolean;
}

export async function getNewStuff(apiToken: string): Promise<NewStuffItem[]> {
  const res = await apiFetch("/api/library/recent?take=10", apiToken);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
  return items.map((r: any) => ({
    id: r.id,
    title: r.title ?? "Unknown",
    year: r.year ?? "",
    type: r.type ?? "movie",
    available: r.mediaStatus === 5 || r.statusBadge === "Available",
  }));
}
