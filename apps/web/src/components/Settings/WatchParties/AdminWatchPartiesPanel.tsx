"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { ConfirmationModal } from "@/components/Common/ConfirmationModal";

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
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"delete" | "end">("delete");
  const [modalIds, setModalIds] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const { data, error, isLoading, mutate } = useSWR("/api/v1/admin/watch-parties?limit=200", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30000,
  });

  const [nowMs, setNowMs] = useState(() => Date.now());
  // eslint-disable-next-line react-hooks/set-state-in-effect -- updating display timestamp when SWR data refreshes; equivalent to useSWR onSuccess
  useEffect(() => { setNowMs(Date.now()); }, [data]);

  function isLikelyInactive(party: AdminWatchParty) {
    if (party.status !== "active") return false;
    const baseline = party.lastMessageAt || party.updatedAt || party.createdAt;
    const ageMs = nowMs - new Date(baseline).getTime();
    return ageMs > 45 * 60 * 1000;
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function openConfirm(action: "delete" | "end", ids: string[]) {
    if (ids.length === 0) return;
    if (action === "end") {
      const activeIds = ids.filter((id) => parties.some((party) => party.id === id && party.status === "active"));
      if (activeIds.length === 0) {
        toast.error("No active watch parties selected to end");
        return;
      }
      ids = activeIds;
    }
    setModalAction(action);
    setModalIds(ids);
    setModalOpen(true);
  }

  async function executeAction() {
    if (modalIds.length === 0) return;
    setActionLoading(true);
    try {
      await Promise.all(
        modalIds.map(async (id) => {
          if (modalAction === "delete") {
            const res = await csrfFetch(`/api/v1/admin/watch-parties/${id}`, {
              method: "DELETE",
              credentials: "include",
            });
            if (!res.ok) throw new Error("delete_failed");
            return;
          }
          const res = await csrfFetch(`/api/v1/admin/watch-parties/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "end" }),
          });
          if (!res.ok) throw new Error("end_failed");
        })
      );
      toast.success(
        modalAction === "delete"
          ? `Deleted ${modalIds.length} watch part${modalIds.length === 1 ? "y" : "ies"}`
          : `Ended ${modalIds.length} watch part${modalIds.length === 1 ? "y" : "ies"}`
      );
      setSelectedIds((prev) => prev.filter((id) => !modalIds.includes(id)));
      setModalOpen(false);
      await mutate();
    } catch {
      toast.error(modalAction === "delete" ? "Unable to delete one or more watch parties" : "Unable to end one or more watch parties");
    } finally {
      setActionLoading(false);
      setDeletingId(null);
    }
  }

  async function deleteParty(party: AdminWatchParty) {
    setDeletingId(party.id);
    openConfirm("delete", [party.id]);
  }

  async function endParty(party: AdminWatchParty) {
    if (party.status !== "active") {
      toast.error("Only active watch parties can be ended");
      return;
    }
    openConfirm("end", [party.id]);
  }

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
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1">
            Selected: {selectedIds.length}
          </span>
        </div>
        {selectedIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openConfirm("end", selectedIds)}
              className="inline-flex items-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 transition-colors hover:bg-amber-500/20"
            >
              End Selected
            </button>
            <button
              type="button"
              onClick={() => openConfirm("delete", selectedIds)}
              className="inline-flex items-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 transition-colors hover:bg-rose-500/20"
            >
              Delete Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {parties.map((party) => (
          <article key={party.id} className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(party.id)}
                  onChange={() => toggleSelected(party.id)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                />
                <div>
                  <h3 className="line-clamp-2 text-base font-semibold text-white">{party.partyName}</h3>
                  {isLikelyInactive(party) ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-200">Likely inactive</p>
                  ) : null}
                </div>
              </div>
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

            <div className="mt-4 flex items-center gap-2">
              <Link
                href={`/watch-party/${party.partySlug}`}
                target="_blank"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              >
                Open party
              </Link>
              {party.status === "active" ? (
                <button
                  type="button"
                  onClick={() => void endParty(party)}
                  className="inline-flex items-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 transition-colors hover:bg-amber-500/20"
                >
                  End party
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void deleteParty(party)}
                disabled={deletingId === party.id}
                className="inline-flex items-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 transition-colors hover:border-rose-400/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === party.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <ConfirmationModal
        isOpen={modalOpen}
        onClose={() => {
          if (actionLoading) return;
          setModalOpen(false);
          setDeletingId(null);
        }}
        onConfirm={() => void executeAction()}
        title={modalAction === "delete" ? "Delete watch party" : "End watch party"}
        message={
          modalAction === "delete"
            ? `This will permanently delete ${modalIds.length} watch part${modalIds.length === 1 ? "y" : "ies"}, including chat, invites, and participant history.`
            : `This will end ${modalIds.length} active watch part${modalIds.length === 1 ? "y" : "ies"}.`
        }
        confirmText={
          modalAction === "delete"
            ? `Delete ${modalIds.length}`
            : `End ${modalIds.length}`
        }
        cancelText="Cancel"
        variant={modalAction === "delete" ? "danger" : "warning"}
        isLoading={actionLoading}
      />

      {parties.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-10 text-center text-sm text-white/60">
          No watch parties found.
        </div>
      ) : null}
    </div>
  );
}
