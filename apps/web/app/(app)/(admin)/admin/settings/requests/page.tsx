import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/auth";

export const metadata = {
  title: "Request Settings - LeMedia",
};
import { listRequests } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { approveRequest, denyRequest, deleteRequest, markRequestAvailable, syncRequests } from "./actions";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { RequestsListClient } from "@/components/Settings/Requests/RequestsListClient";

export default async function AdminRequestsPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }
  const imageProxyEnabled = await getImageProxyEnabled();
  if (!user.isAdmin) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-8 shadow-lg shadow-black/10">
        <div className="text-lg font-bold">Forbidden</div>
        <div className="mt-2 text-sm opacity-75">You&apos;re not in the admin group.</div>
      </div>
    );
  }

  const requests = await listRequests(100);

  // Fetch TMDB details for posters
  const detailedRequests = await Promise.all(
    requests.map(async (r) => {
        try {
            const details = r.request_type === "movie" 
                ? await getMovie(r.tmdb_id).catch(() => null)
                : await getTv(r.tmdb_id).catch(() => null);
            const poster_path = details?.poster_path 
              ? tmdbImageUrl(details.poster_path, "w200", imageProxyEnabled) 
              : null;
            return { ...r, poster_path };
        } catch {
            return { ...r, poster_path: null };
        }
    })
  );

  const pending = detailedRequests.filter(r => r.status === "pending");
  const other = detailedRequests.filter(r => r.status !== "pending");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Requests</h2>
          <p className="text-sm text-muted">Review and approve incoming media requests.</p>
        </div>
        <form action={syncRequests}>
          <button type="submit" className="btn btn-sm btn-outline">
            Sync statuses
          </button>
        </form>
      </div>

      <RequestsListClient 
        initialPending={pending} 
        initialOther={other}
        approveRequest={approveRequest}
        denyRequest={denyRequest}
        deleteRequest={deleteRequest}
        markRequestAvailable={markRequestAvailable}
      />
    </section>
  );
}
