"use client";

import useSWR from "swr";
import Link from "next/link";

type AdminWatchParty = {
  id: string;
  partySlug: string;
  partyName: string;
  mediaType: "movie" | "tv";
  mediaTitle: string;
  hostUserId: number;
  hostUsername: string;
  status: "active" | "ended" | "cancelled";
  viewerCount: number;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  theme: string;
};

type Payload = { parties: AdminWatchParty[] };

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch watch parties");
  return (await res.json()) as Payload;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusClass(status: AdminWatchParty["status"]) {
  if (status === "active") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (status === "ended") return "border-slate-400/30 bg-slate-400/10 text-slate-200";
  return "border-rose-400/30 bg-rose-500/10 text-rose-200";
}

export function AdminWatchPartiesPanel() {
  const { data, error, isLoading } = useSWR("/api/v1/admin/watch-parties?limit=200", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-8 text-sm text-white/70">
        Loading watch parties...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-sm text-rose-100">
        Unable to load watch parties.
      </div>
    );
  }

  const parties = data?.parties ?? [];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1">
            Total: {parties.length}
          </span>
          <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
            Active: {parties.filter((p) => p.status === "active").length}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {parties.map((party) => (
          <article key={party.id} className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="line-clamp-2 text-base font-semibold text-white">{party.partyName}</h3>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(party.status)}`}>
                {party.status}
              </span>
            </div>

            <p className="text-sm text-white/70">{party.mediaTitle}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">{party.mediaType}</p>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-white/45">Host</dt>
                <dd className="text-white">{party.hostUsername}</dd>
              </div>
              <div>
                <dt className="text-white/45">Theme</dt>
                <dd className="text-white">{party.theme}</dd>
              </div>
              <div>
                <dt className="text-white/45">Viewers</dt>
                <dd className="text-white">{party.viewerCount}</dd>
              </div>
              <div>
                <dt className="text-white/45">Messages</dt>
                <dd className="text-white">{party.messageCount}</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-white/55">Last chat: {formatDate(party.lastMessageAt)}</p>
            <p className="mt-1 text-xs text-white/45">Created: {formatDate(party.createdAt)}</p>

            <div className="mt-4">
              <Link
                href={`/watch-party/${party.partySlug}`}
                target="_blank"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              >
                Open party
              </Link>
            </div>
          </article>
        ))}
      </div>

      {parties.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-10 text-center text-sm text-white/60">
          No watch parties found.
        </div>
      ) : null}
    </div>
  );
}
