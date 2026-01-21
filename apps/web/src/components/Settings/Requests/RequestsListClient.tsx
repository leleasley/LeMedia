"use client";

import { useState } from "react";
import Image from "next/image";
import { formatDate } from "@/lib/dateFormat";
import { useRouter } from "next/navigation";

const statusClasses: Record<string, string> = {
  available: "bg-emerald-500/10 text-emerald-100 border border-emerald-500/30",
  partially_available: "bg-emerald-500/10 text-emerald-100 border border-emerald-500/30",
  downloading: "bg-amber-500/10 text-amber-100 border border-amber-500/30",
  submitted: "bg-blue-500/10 text-blue-100 border border-blue-500/30",
  pending: "bg-sky-500/10 text-sky-100 border border-sky-500/30",
  denied: "bg-red-500/10 text-red-100 border border-red-500/30",
  failed: "bg-red-500/10 text-red-100 border border-red-500/30",
  removed: "bg-slate-500/10 text-slate-100 border-slate-500/40",
  already_exists: "bg-violet-500/10 text-violet-100 border-violet-500/40"
};

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

function StatusBadge({ status }: { status: string }) {
  const base = statusClasses[status] ?? statusClasses["submitted"];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${base}`}>
      {formatStatusLabel(status)}
    </span>
  );
}

type Request = {
  id: number | string;
  tmdb_id: number;
  title: string;
  request_type: string;
  status: string;
  created_at: string;
  username: string;
  poster_path: string | null;
  avatar_url?: string | null;
};

export function RequestsListClient({ 
  initialPending, 
  initialOther,
  approveRequest,
  denyRequest,
  deleteRequest,
  markRequestAvailable
}: { 
  initialPending: Request[]; 
  initialOther: Request[];
  approveRequest: (formData: FormData) => Promise<void>;
  denyRequest: (formData: FormData) => Promise<void>;
  deleteRequest: (formData: FormData) => Promise<void>;
  markRequestAvailable: (formData: FormData) => Promise<void>;
}) {
  const [optimisticRemovals, setOptimisticRemovals] = useState<Set<string | number>>(new Set());
  const router = useRouter();

  const handleAction = async (action: string, requestId: string | number) => {
    // Optimistically remove from UI
    if (action === "approve" || action === "deny" || action === "delete") {
      setOptimisticRemovals(prev => new Set(prev).add(requestId));
    }
    
    const formData = new FormData();
    formData.append("requestId", String(requestId));

    if (action === "approve") await approveRequest(formData);
    else if (action === "deny") await denyRequest(formData);
    else if (action === "delete") await deleteRequest(formData);
    else if (action === "markAvailable") await markRequestAvailable(formData);
    
    router.refresh();
  };

  const visiblePending = initialPending.filter(r => !optimisticRemovals.has(r.id));
  const visibleOther = initialOther.filter(r => !optimisticRemovals.has(r.id));

  return (
    <>
      <div className="rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden shadow-lg shadow-black/10">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">Pending approval</h3>
        </div>
        {visiblePending.length === 0 ? (
          <div className="p-6 text-sm opacity-60">No pending requests.</div>
        ) : (
          <>
            <div className="md:hidden space-y-4 p-4">
              {visiblePending.map(r => (
                <div key={r.id} className="rounded-lg border border-white/10 bg-slate-950/50 p-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="relative w-12 h-16 rounded overflow-hidden bg-black/20 shadow-sm border border-white/5">
                      {r.poster_path ? (
                        <Image src={r.poster_path} alt={r.title} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] text-muted">No Img</div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{r.title}</div>
                      <div className="text-[0.6rem] uppercase tracking-wider text-muted mt-1">{r.request_type}</div>
                      <div className="mt-2 text-xs text-muted">{formatDate(r.created_at)}</div>
                      <div className="text-xs text-white">{r.username}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleAction("approve", r.id)} className="btn btn-primary text-xs">Approve</button>
                    <button onClick={() => handleAction("deny", r.id)} className="btn text-xs">Deny</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="opacity-75 border-b border-white/10">
                  <tr className="bg-white/5">
                    <th className="p-4 pl-6 font-semibold w-24">Poster</th>
                    <th className="p-4 text-left font-semibold">When</th>
                    <th className="p-4 text-left font-semibold">User</th>
                    <th className="p-4 text-left font-semibold">Title</th>
                    <th className="p-4 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {visiblePending.map(r => (
                    <tr key={r.id} className="hover:bg-white/5 transition-colors group">
                      <td className="p-3 pl-6">
                        <div className="relative w-10 h-14 rounded overflow-hidden bg-black/20 shadow-sm border border-white/5">
                          {r.poster_path ? (
                            <Image src={r.poster_path} alt={r.title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-muted">No Img</div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 opacity-75 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="p-4 whitespace-nowrap font-medium">{r.username}</td>
                      <td className="p-4">
                        <div className="font-medium text-white">{r.title}</div>
                        <div className="text-xs text-muted uppercase tracking-wider mt-0.5">{r.request_type}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button onClick={() => handleAction("approve", r.id)} className="btn btn-primary text-xs">Approve</button>
                          <button onClick={() => handleAction("deny", r.id)} className="btn text-xs">Deny</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden shadow-lg shadow-black/10">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">Recent requests</h3>
        </div>
        <div className="md:hidden space-y-4 p-4">
          {visibleOther.map(r => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-slate-950/50 p-4 space-y-3">
              <div className="flex gap-3">
                <div className="relative w-12 h-16 rounded overflow-hidden bg-black/20 shadow-sm border border-white/5">
                  {r.poster_path ? (
                    <Image src={r.poster_path} alt={r.title} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[8px] text-muted">No Img</div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{r.title}</div>
                  <div className="text-[0.6rem] uppercase tracking-wider text-muted mt-1">{r.request_type}</div>
                  <div className="mt-2 text-xs text-muted">{formatDate(r.created_at)}</div>
                  <div className="text-xs text-white">{r.username}</div>
                </div>
              </div>
              <div>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status !== "available" && r.status !== "removed" && (
                  <button onClick={() => handleAction("markAvailable", r.id)} className="btn btn-sm btn-ghost text-xs">Mark available</button>
                )}
                <button onClick={() => handleAction("delete", r.id)} className="btn btn-sm btn-error text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-75 border-b border-white/10">
              <tr className="bg-white/5">
                <th className="p-4 pl-6 font-semibold w-24">Poster</th>
                <th className="p-4 text-left font-semibold">When</th>
                <th className="p-4 text-left font-semibold">User</th>
                <th className="p-4 text-left font-semibold">Title</th>
                <th className="p-4 text-left font-semibold">Status</th>
                <th className="p-4 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleOther.map(r => (
                <tr key={r.id} className="hover:bg-white/5 transition-colors group">
                  <td className="p-3 pl-6">
                    <div className="relative w-10 h-14 rounded overflow-hidden bg-black/20 shadow-sm border border-white/5">
                      {r.poster_path ? (
                        <Image src={r.poster_path} alt={r.title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] text-muted">No Img</div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 opacity-75 whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="p-4 whitespace-nowrap font-medium">{r.username}</td>
                  <td className="p-4">
                    <div className="font-medium text-white">{r.title}</div>
                    <div className="text-xs text-muted uppercase tracking-wider mt-0.5">{r.request_type}</div>
                  </td>
                  <td className="p-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {r.status !== "available" && r.status !== "removed" && (
                        <button onClick={() => handleAction("markAvailable", r.id)} className="btn btn-sm btn-ghost text-xs">Mark available</button>
                      )}
                      <button onClick={() => handleAction("delete", r.id)} className="btn btn-sm btn-error text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
