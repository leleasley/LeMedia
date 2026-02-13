import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { listRequests, updateRequestMetadata } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { approveRequest, denyRequest, deleteRequest, markRequestAvailable } from "./actions";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { AllRequestsClient } from "@/components/Admin/AllRequestsClient";
import { getActiveDownloadTmdbIds, shouldForceDownloading } from "@/lib/download-status";
import { getAvailabilityStatusByTmdbIds } from "@/lib/library-availability";

export const metadata = {
  title: "All Requests - LeMedia",
};

export default async function AllRequestsPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  if (!user.isAdmin) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-8 shadow-lg shadow-black/10">
        <div className="text-lg font-bold text-white">Forbidden</div>
        <div className="mt-2 text-sm text-white/75">You&apos;re not in the admin group.</div>
      </div>
    );
  }

  const [imageProxyEnabled, requests] = await Promise.all([
    getImageProxyEnabled(),
    listRequests(200)
  ]);
  const activeDownloads = await getActiveDownloadTmdbIds();
  const movieIds = Array.from(new Set(requests.filter(r => r.request_type === "movie").map(r => Number(r.tmdb_id))));
  const tvIds = Array.from(new Set(requests.filter(r => r.request_type === "episode").map(r => Number(r.tmdb_id))));
  const [movieAvailability, tvAvailability] = await Promise.all([
    movieIds.length ? getAvailabilityStatusByTmdbIds("movie", movieIds).catch(() => ({} as Record<number, string>)) : Promise.resolve({} as Record<number, string>),
    tvIds.length ? getAvailabilityStatusByTmdbIds("tv", tvIds).catch(() => ({} as Record<number, string>)) : Promise.resolve({} as Record<number, string>)
  ]);

  const tmdbResults = await Promise.allSettled(
    requests.map((r) => {
      const needsDetails = !r.poster_path || !r.backdrop_path;
      if (!needsDetails) return Promise.resolve(null);
      return r.request_type === "movie" ? getMovie(r.tmdb_id) : getTv(r.tmdb_id);
    })
  );

  const detailedRequests = await Promise.all(
    requests.map(async (r, idx) => {
      try {
        const detailsResult = tmdbResults[idx];
        const details = detailsResult?.status === "fulfilled" ? detailsResult.value : null;
        if (details && (!r.poster_path || !r.backdrop_path || !r.release_year)) {
          void updateRequestMetadata({
            requestId: r.id,
            posterPath: r.poster_path ?? details?.poster_path ?? null,
            backdropPath: r.backdrop_path ?? details?.backdrop_path ?? null,
            releaseYear: r.release_year ?? (
              r.request_type === "movie"
                ? Number(details?.release_date?.slice(0, 4)) || null
                : Number(details?.first_air_date?.slice(0, 4)) || null
            )
          }).catch(() => undefined);
        }
        const posterSource = r.poster_path ?? details?.poster_path ?? null;
        const backdropSource = r.backdrop_path ?? details?.backdrop_path ?? null;
        const poster_path = posterSource ? tmdbImageUrl(posterSource, "w200", imageProxyEnabled) : null;
        const backdrop_path = backdropSource ? tmdbImageUrl(backdropSource, "w500", imageProxyEnabled) : null;
        const availabilityStatus = r.request_type === "movie"
          ? movieAvailability[Number(r.tmdb_id)]
          : tvAvailability[Number(r.tmdb_id)];
        const forcedDownloading = shouldForceDownloading({
          status: r.status,
          tmdbId: r.tmdb_id,
          mediaType: r.request_type as "movie" | "episode",
          active: activeDownloads
        });
        const status = forcedDownloading
          ? "downloading"
          : availabilityStatus === "available"
            ? "available"
            : availabilityStatus === "partially_available"
              ? "partially_available"
              : r.status;
        return {
          ...r,
          status,
          poster_path,
          backdrop_path
        };
      } catch {
        const availabilityStatus = r.request_type === "movie"
          ? movieAvailability[Number(r.tmdb_id)]
          : tvAvailability[Number(r.tmdb_id)];
        const forcedDownloading = shouldForceDownloading({
          status: r.status,
          tmdbId: r.tmdb_id,
          mediaType: r.request_type as "movie" | "episode",
          active: activeDownloads
        });
        const status = forcedDownloading
          ? "downloading"
          : availabilityStatus === "available"
            ? "available"
            : availabilityStatus === "partially_available"
              ? "partially_available"
              : r.status;
        return {
          ...r,
          status,
          poster_path: null,
          backdrop_path: null
        };
      }
    })
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">All Requests</h1>
          <p className="text-sm text-white/60 mt-1">Manage and review all media requests from your users</p>
        </div>
      </div>

      <AllRequestsClient
        initialRequests={detailedRequests}
        approveRequest={approveRequest}
        denyRequest={denyRequest}
        deleteRequest={deleteRequest}
        markRequestAvailable={markRequestAvailable}
      />
    </section>
  );
}
