"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getUser } from "@/auth";
import {
  deleteRequestById,
  getRequestNotificationContext,
  getRequestWithItems,
  markRequestStatus,
  setRequestItemsProviderId,
  setRequestItemsStatus
} from "@/db";
import { addMovie, deleteMovie } from "@/lib/radarr";
import { getMovie, getTvExternalIds } from "@/lib/tmdb";
import {
  addSeriesFromLookup,
  deleteQueueItem,
  deleteSeries,
  episodeSearch,
  getEpisodesForSeries,
  listSeries,
  lookupSeriesByTvdb,
  setEpisodeMonitored,
  sonarrQueue
} from "@/lib/sonarr";
import { notifyRequestEvent } from "@/notifications/request-events";
import { syncPendingRequests } from "@/lib/request-sync";

async function setFlash(type: "success" | "error", message: string) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  if (type === "success") {
    store.set("lemedia_flash", message, { httpOnly: true, sameSite: "lax", path: "/", secure, maxAge: 120 });
    store.delete("lemedia_flash_error");
  } else {
    store.set("lemedia_flash_error", message, { httpOnly: true, sameSite: "lax", path: "/", secure, maxAge: 120 });
    store.delete("lemedia_flash");
  }
}

async function refreshRequestsPage() {
  // Ensure the RSC cache and page data update so flash toasts render immediately after actions
  revalidatePath("/admin/settings/requests");
}

async function cleanupProviders(data: Awaited<ReturnType<typeof getRequestWithItems>>) {
  if (!data) return;
  if (data.request.request_type === "movie") {
    for (const item of data.items) {
      if (item.provider === "radarr" && item.provider_id) {
        await deleteMovie(item.provider_id, { deleteFiles: true, addExclusion: true }).catch(() => { });
      }
    }
    return;
  }
  if (data.request.request_type === "episode") {
    const seriesId = data.items.find(item => item.provider === "sonarr")?.provider_id;
    if (!seriesId) return;

    const episodes = await getEpisodesForSeries(seriesId).catch(() => []);
    const requestedEpisodeIds = data.items
      .filter(item => item.provider === "sonarr" && item.season != null && item.episode != null)
      .map(item => {
        return episodes.find(
          (ep: any) => ep.seasonNumber === item.season && ep.episodeNumber === item.episode
        );
      })
      .filter(Boolean)
      .map(ep => ep.id);

    if (requestedEpisodeIds.length) {
      await setEpisodeMonitored(requestedEpisodeIds, false).catch(() => { });
    }

    const queueResponse = await sonarrQueue(1, 200).catch(() => null);
    const queueRecords = Array.isArray(queueResponse)
      ? queueResponse
      : Array.isArray(queueResponse?.records)
        ? queueResponse.records
        : [];

    for (const entry of queueRecords) {
      const entryEpisodeIds: number[] = Array.isArray(entry.episodeIds)
        ? entry.episodeIds
        : typeof entry.episodeId === "number"
          ? [entry.episodeId]
          : [];
      if (!entryEpisodeIds.length) continue;
      if (entryEpisodeIds.some(id => requestedEpisodeIds.includes(id))) {
        await deleteQueueItem(entry.id).catch(() => { });
      }
    }

    await deleteSeries(seriesId, { deleteFiles: true, addExclusion: true }).catch(() => { });
  }
}

export async function approveRequest(formData: FormData) {
  const user = await getUser();
  if (!user.isAdmin) redirect("/");

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) redirect("/admin/settings/requests");

  const data = await getRequestWithItems(requestId);
  if (!data) redirect("/admin/settings/requests");
  if (data.request.status !== "pending") redirect("/admin/settings/requests");

  try {
    if (data.request.request_type === "movie") {
      const movie = await getMovie(data.request.tmdb_id);
      const radarrMovie = await addMovie(data.request.tmdb_id, undefined, movie);
      await setRequestItemsProviderId(requestId, radarrMovie?.id ?? null);
      await setRequestItemsStatus(requestId, "submitted");
      await markRequestStatus(requestId, "submitted");
      const ctx = await getRequestNotificationContext(requestId);
      if (ctx) {
        await notifyRequestEvent("request_submitted", {
          requestId,
          requestType: ctx.request_type,
          tmdbId: ctx.tmdb_id,
          title: ctx.title,
          username: ctx.username,
          userId: ctx.user_id
        });
      }
      await setFlash("success", "Request approved and submitted");
      await refreshRequestsPage();
      redirect("/admin/settings/requests");
    }

    if (data.request.request_type === "episode") {
      const ext = await getTvExternalIds(data.request.tmdb_id);
      const tvdbId = ext?.tvdb_id;
      if (!tvdbId) throw new Error("TMDB show has no tvdb_id; Sonarr needs TVDB");

      const seasonNumbers = new Set<number>();
      const episodeNumbers = new Set<number>();
      for (const item of data.items) {
        if (item.season != null) seasonNumbers.add(item.season);
        if (item.episode != null) episodeNumbers.add(item.episode);
      }
      const seasons = Array.from(seasonNumbers.values());
      if (seasons.length !== 1) throw new Error("Request must contain exactly one season");
      const seasonNumber = seasons[0];
      const requestedEpisodeNumbers = Array.from(episodeNumbers.values());
      if (!requestedEpisodeNumbers.length) throw new Error("No episodes in request");

      const existing = (await listSeries()).find((s: any) => s.tvdbId === tvdbId);
      let series = existing;
      if (!series) {
        const lookup = await lookupSeriesByTvdb(tvdbId);
        if (!Array.isArray(lookup) || lookup.length === 0) {
          throw new Error(`Sonarr lookup returned nothing for tvdb:${tvdbId}`);
        }
        series = await addSeriesFromLookup(lookup[0], false);
      }

      const episodes = await getEpisodesForSeries(series.id);
      const wanted: Array<{ id: number; episodeNumber: number }> = episodes
        .filter((e: any) => e.seasonNumber === seasonNumber && requestedEpisodeNumbers.includes(e.episodeNumber))
        .map((e: any) => ({ id: e.id, episodeNumber: e.episodeNumber }));
      if (wanted.length === 0) throw new Error("No matching episodes found in Sonarr (episodes not populated yet?)");

      const episodeIds = wanted.map((w: { id: number }) => w.id);
      await setEpisodeMonitored(episodeIds, true);
      await episodeSearch(episodeIds);

      await setRequestItemsProviderId(requestId, series.id);
      await setRequestItemsStatus(requestId, "submitted");
      await markRequestStatus(requestId, "submitted");
      const ctx = await getRequestNotificationContext(requestId);
      if (ctx) {
        await notifyRequestEvent("request_submitted", {
          requestId,
          requestType: ctx.request_type,
          tmdbId: ctx.tmdb_id,
          title: ctx.title,
          username: ctx.username,
          userId: ctx.user_id
        });
      }
      await setFlash("success", "Request approved and submitted");
      await refreshRequestsPage();
      redirect("/admin/settings/requests");
    }

    throw new Error(`Unsupported request type: ${data.request.request_type}`);
  } catch (e: any) {
    await markRequestStatus(requestId, "failed");
    await setRequestItemsStatus(requestId, "failed");
    const ctx = await getRequestNotificationContext(requestId);
    if (ctx) {
      await notifyRequestEvent("request_failed", {
        requestId,
        requestType: ctx.request_type,
        tmdbId: ctx.tmdb_id,
        title: ctx.title,
        username: ctx.username,
        userId: ctx.user_id
      });
    }
    await setFlash("error", "Failed to submit request. Check Sonarr/Radarr connectivity.");
    redirect("/admin/settings/requests");
  }
}

export async function denyRequest(formData: FormData) {
  const user = await getUser();
  if (!user.isAdmin) redirect("/");

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) redirect("/admin/settings/requests");

  const data = await getRequestWithItems(requestId);
  if (!data) redirect("/admin/settings/requests");
  if (data.request.status !== "pending") redirect("/admin/settings/requests");

  await markRequestStatus(requestId, "denied");
  await setRequestItemsStatus(requestId, "denied");
  const ctx = await getRequestNotificationContext(requestId);
  if (ctx) {
    await notifyRequestEvent("request_denied", {
      requestId,
      requestType: ctx.request_type,
      tmdbId: ctx.tmdb_id,
      title: ctx.title,
      username: ctx.username,
      userId: ctx.user_id
    });
  }
  await setFlash("success", "Request denied");
  await refreshRequestsPage();
  redirect("/admin/settings/requests");
}

export async function syncRequests() {
  const user = await getUser();
  if (!user.isAdmin) redirect("/");

  const summary = await syncPendingRequests();
  let message = `Synced ${summary.processed} request(s)`;
  const details: string[] = [];
  if (summary.available) details.push(`available ${summary.available}`);
  if (summary.downloading) details.push(`downloading ${summary.downloading}`);
  if (summary.removed) details.push(`removed ${summary.removed}`);
  if (details.length) message += ` (${details.join(", ")})`;
  if (summary.errors) message += ` [${summary.errors} errors]`;
  await setFlash("success", message);
  await refreshRequestsPage();
  redirect("/admin/settings/requests");
}

export async function markRequestAvailable(formData: FormData) {
  const user = await getUser();
  if (!user.isAdmin) redirect("/");

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) redirect("/admin/settings/requests");

  await Promise.all([markRequestStatus(requestId, "available"), setRequestItemsStatus(requestId, "available")]);
  await setFlash("success", "Request marked as available");
  await refreshRequestsPage();
  redirect("/admin/settings/requests");
}

export async function deleteRequest(formData: FormData) {
  const user = await getUser();
  if (!user.isAdmin) redirect("/");

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) redirect("/admin/settings/requests");

  const data = await getRequestWithItems(requestId);
  if (!data) redirect("/admin/settings/requests");

  await cleanupProviders(data).catch(() => { });
  await deleteRequestById(requestId);
  await setFlash("success", "Request deleted (provider cleanup triggered)");
  await refreshRequestsPage();
  redirect("/admin/settings/requests");
}
