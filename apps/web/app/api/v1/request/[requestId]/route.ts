import { NextRequest, NextResponse } from "next/server";
import { extractExternalApiKey, getExternalApiAuth } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { deleteRequestById, findRequestIdByNumericId, getRequestWithItems } from "@/db";
import { getJellyfinItemIdByTmdb } from "@/lib/jellyfin";
import { deleteMovie, getMovieByTmdbId } from "@/lib/radarr";
import { deleteSeries, getSeriesByTmdbId } from "@/lib/sonarr";

function extractApiKey(req: NextRequest) {
  return extractExternalApiKey(req);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function uuidToNumericId(uuid: string): number {
  const hex = uuid.replace(/-/g, '').substring(0, 7);
  const num = parseInt(hex, 16);
  return num % 2147483647;
}

function mapStatusToOverseerr(status: string): number {
  const statusMap: Record<string, number> = {
    "pending": 1,
    "queued": 2,
    "submitted": 2,
    "downloading": 2,
    "available": 5,
    "denied": 3,
    "failed": 4,
    "already_exists": 5
  };
  return statusMap[status] ?? 1;
}

async function resolveRequestId(raw: string): Promise<string | null> {
  if (isUuid(raw)) return raw;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return await findRequestIdByNumericId(numeric);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const apiKey = extractApiKey(req);
  const auth = apiKey ? await getExternalApiAuth(apiKey) : { ok: false, isGlobal: false, userId: null };
  if (!auth.ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const { requestId: raw } = await params;
  const requestId = await resolveRequestId(raw);
  if (!requestId) {
    return cacheableJsonResponseWithETag(req, { error: "Request not found" }, { maxAge: 0, private: true });
  }

  const data = await getRequestWithItems(requestId);
  if (!data?.request) {
    return cacheableJsonResponseWithETag(req, { error: "Request not found" }, { maxAge: 0, private: true });
  }

  const r = data.request;
  const mediaType = r.request_type === "episode" ? "tv" : "movie";
  const jellyfinMediaId = await getJellyfinItemIdByTmdb(mediaType, r.tmdb_id);

  return cacheableJsonResponseWithETag(req, {
    id: uuidToNumericId(r.id),
    requestId: r.id,
    status: mapStatusToOverseerr(r.status),
    statusText: r.status,
    createdAt: r.created_at,
    updatedAt: r.created_at,
    type: mediaType,
    mediaType,
    title: r.title,
    tmdbId: r.tmdb_id,
    requestedBy: {
      id: r.user_id,
      username: r.username,
      displayName: r.username
    },
    modifiedBy: null,
    is4k: false,
    serverId: null,
    profileId: null,
    rootFolder: null,
    media: {
      id: r.tmdb_id,
      jellyfinMediaId: jellyfinMediaId ?? null,
      tmdbId: r.tmdb_id,
      mediaType,
      status: mapStatusToOverseerr(r.status)
    }
  }, { maxAge: 30, private: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const apiKey = extractApiKey(req);
  const auth = apiKey ? await getExternalApiAuth(apiKey) : { ok: false, isGlobal: false, userId: null };
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId: raw } = await params;
  const requestId = await resolveRequestId(raw);
  if (!requestId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const data = await getRequestWithItems(requestId);
  if (data?.request) {
    const mediaType = data.request.request_type === "episode" ? "tv" : "movie";
    const items = data.items ?? [];
    try {
      if (mediaType === "movie") {
        const providerIds = Array.from(new Set(items.filter(i => i.provider === "radarr" && i.provider_id).map(i => i.provider_id as number)));
        if (providerIds.length) {
          for (const id of providerIds) {
            await deleteMovie(id, { deleteFiles: false, addExclusion: false });
          }
        } else {
          const radarrMovie = await getMovieByTmdbId(data.request.tmdb_id);
          if (radarrMovie?.id) {
            await deleteMovie(Number(radarrMovie.id), { deleteFiles: false, addExclusion: false });
          }
        }
      } else {
        const providerIds = Array.from(new Set(items.filter(i => i.provider === "sonarr" && i.provider_id).map(i => i.provider_id as number)));
        if (providerIds.length) {
          for (const id of providerIds) {
            await deleteSeries(id, { deleteFiles: false, addExclusion: false });
          }
        } else {
          const series = await getSeriesByTmdbId(data.request.tmdb_id);
          if (series?.id) {
            await deleteSeries(Number(series.id), { deleteFiles: false, addExclusion: false });
          }
        }
      }
    } catch {
      // Best-effort cleanup; still remove request record below.
    }
  }

  await deleteRequestById(requestId);
  return NextResponse.json({ ok: true });
}
