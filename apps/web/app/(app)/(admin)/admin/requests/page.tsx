import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { listRequests } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { approveRequest, denyRequest, deleteRequest, markRequestAvailable, syncRequests } from "./actions";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { AllRequestsClient } from "@/components/Admin/AllRequestsClient";

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

  const imageProxyEnabled = await getImageProxyEnabled();
  const requests = await listRequests(200);

  // Fetch TMDB details for posters and backdrop
  const detailedRequests = await Promise.all(
    requests.map(async (r) => {
      try {
        const details = r.request_type === "movie"
          ? await getMovie(r.tmdb_id).catch(() => null)
          : await getTv(r.tmdb_id).catch(() => null);
        const poster_path = details?.poster_path
          ? tmdbImageUrl(details.poster_path, "w200", imageProxyEnabled)
          : null;
        const backdrop_path = details?.backdrop_path
          ? tmdbImageUrl(details.backdrop_path, "w500", imageProxyEnabled)
          : null;
        return { ...r, poster_path, backdrop_path };
      } catch {
        return { ...r, poster_path: null, backdrop_path: null };
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
        syncRequests={syncRequests}
      />
    </section>
  );
}
