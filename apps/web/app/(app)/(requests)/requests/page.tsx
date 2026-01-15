import { redirect } from "next/navigation";
import { getUser } from "@/auth";

export const metadata = {
  title: "Requests - LeMedia",
};
export const revalidate = 0;
import { listRequestsByUsername, updateRequestMetadata } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { RequestsPageClient } from "@/components/Requests/RequestsPageClient";

export default async function RequestsPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }
  const imageProxyEnabled = await getImageProxyEnabled();
  const requests = await listRequestsByUsername(user.username);

  const tmdbResults = await Promise.allSettled(
    requests.map((r) => {
      const hasLocalPoster = Boolean(r.poster_path);
      if (hasLocalPoster) return Promise.resolve(null);
      return r.request_type === "movie" ? getMovie(r.tmdb_id) : getTv(r.tmdb_id);
    })
  );

  const detailedRequests = await Promise.all(
    requests.map(async (r, idx) => {
      try {
        const detailsResult = tmdbResults[idx];
        const details = detailsResult?.status === "fulfilled" ? detailsResult.value : null;
        if (details && !r.poster_path) {
          void updateRequestMetadata({
            requestId: r.id,
            posterPath: details?.poster_path ?? null,
            backdropPath: details?.backdrop_path ?? null,
            releaseYear: r.request_type === "movie"
              ? Number(details?.release_date?.slice(0, 4)) || null
              : Number(details?.first_air_date?.slice(0, 4)) || null
          }).catch(() => undefined);
        }
        const posterPath = r.poster_path ?? details?.poster_path ?? null;
        const posterUrl = posterPath ? tmdbImageUrl(posterPath, "w200", imageProxyEnabled) : null;
        return { ...r, posterUrl };
      } catch {
        return { ...r, posterUrl: null };
      }
    })
  );

  return (
    <RequestsPageClient initialRequests={detailedRequests} />
  );
}
