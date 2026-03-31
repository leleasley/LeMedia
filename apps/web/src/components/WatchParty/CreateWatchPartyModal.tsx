"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Common/Modal";
import Button from "@/components/Common/Button";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";

type ExistingParty = {
  id: string;
  partySlug?: string;
  partyName: string;
  hostUsername: string;
  viewerCount: number;
  maxViewers: number;
};

type CreateConflictPayload = {
  error?: string;
  message?: string;
  existingParties?: ExistingParty[];
  canCreateAnother?: boolean;
};

function extractJellyfinItemId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const hashIdx = url.indexOf("#");
    const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : url;
    const qIdx = fragment.indexOf("?");
    if (qIdx < 0) return null;
    return new URLSearchParams(fragment.slice(qIdx + 1)).get("id") ?? null;
  } catch {
    return null;
  }
}

export function CreateWatchPartyModal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  playUrl?: string | null;
}) {
  const { open, onClose, title, mediaType, tmdbId, playUrl } = props;
  const jellyfinItemId = extractJellyfinItemId(playUrl);
  const router = useRouter();
  const toast = useToast();

  const [partyName, setPartyName] = useState(`${title} Party`);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [conflict, setConflict] = useState<CreateConflictPayload | null>(null);
  const [busyPartyId, setBusyPartyId] = useState<string | null>(null);

  const canCreateAnother = Boolean(conflict?.canCreateAnother);
  const existingParties = useMemo(() => conflict?.existingParties ?? [], [conflict]);

  async function create(forceCreate: boolean) {
    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/v1/watch-party", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          tmdbId,
          mediaTitle: title,
          partyName: partyName.trim() || `${title} Party`,
          forceCreate,
          jellyfinItemId: jellyfinItemId ?? undefined,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        party?: { id: string; partySlug?: string };
        error?: string;
        message?: string;
        existingParties?: ExistingParty[];
        canCreateAnother?: boolean;
      };

      if (res.status === 201 && payload.party?.id) {
        setRedirecting(true);
        router.push(`/watch-party/${payload.party.partySlug || payload.party.id}`);
        return;
      }

      if (res.status === 409 && payload.error === "WATCH_PARTY_NAME_TAKEN") {
        toast.error(payload.message || "That party name is already being used by another active party.");
        return;
      }

      if (res.status === 409 && payload.error?.startsWith("WATCH_PARTY")) {
        setConflict({
          error: payload.error,
          message: payload.message,
          existingParties: payload.existingParties ?? [],
          canCreateAnother: payload.canCreateAnother ?? false,
        });
        return;
      }

      toast.error(payload.error || payload.message || "Unable to create watch party");
    } catch {
      toast.error("Unable to create watch party");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestJoin(partyId: string) {
    setBusyPartyId(partyId);
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}/join-request`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };

      if (res.ok) {
        toast.success("Join request sent to host.");
        return;
      }

      toast.error(payload.error || "Unable to request access");
    } catch {
      toast.error("Unable to request access");
    } finally {
      setBusyPartyId(null);
    }
  }

  async function joinWithInvite(partyId: string, partySlug?: string) {
    setBusyPartyId(partyId);
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}/join`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };

      if (res.ok) {
        setRedirecting(true);
        router.push(`/watch-party/${partySlug || partyId}`);
        return;
      }

      if (payload.error === "Invite required to join") {
        await requestJoin(partyId);
        return;
      }

      toast.error(payload.error || "Unable to join watch party");
    } catch {
      toast.error("Unable to join watch party");
    } finally {
      setBusyPartyId(null);
    }
  }

  function handleClose() {
    if (redirecting) return;
    onClose();
    setConflict(null);
    setSubmitting(false);
    setBusyPartyId(null);
    setRedirecting(false);
  }

  return (
    <Modal open={open} onClose={handleClose} title="Create Watch Party">
      {redirecting ? (
        <div className="flex flex-col items-center justify-center py-6 gap-5 text-center">
          <div className="relative mx-auto h-32 w-44">
            <div className="absolute inset-0 rounded-xl border-2 border-slate-300/40 bg-slate-700/30 shadow-[0_0_28px_rgba(15,23,42,0.7)]" />
            <div className="absolute inset-2.5 overflow-hidden rounded-lg border border-slate-400/20 bg-slate-950">
              <div className="absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.18),rgba(255,255,255,0.18)_2px,transparent_2px,transparent_6px)]" />
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-400/15 via-violet-500/10 to-indigo-400/15" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className="select-none text-base font-black tracking-widest text-indigo-200/90">TUNING IN</span>
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
            <div className="absolute -bottom-2 left-5 h-2.5 w-12 -rotate-6 rounded-full bg-slate-500/70" />
            <div className="absolute -bottom-2 right-5 h-2.5 w-12 rotate-6 rounded-full bg-slate-500/70" />
            <div className="absolute -right-1.5 top-10 h-8 w-1.5 rounded bg-slate-400/60" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Tuning you into the Watch Party!</h3>
            <p className="mt-1 text-sm text-gray-400">Getting your room ready&hellip;</p>
          </div>
        </div>
      ) : (
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          Invite-only room. Maximum 10 viewers. You control permissions for invite, pause, and chat moderation.
        </p>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-300" htmlFor="watch-party-name">
            Party name
          </label>
          <input
            id="watch-party-name"
            value={partyName}
            onChange={(event) => setPartyName(event.target.value)}
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            maxLength={80}
            placeholder={`${title} Party`}
          />
        </div>

        {conflict ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
            <p className="text-sm font-medium text-amber-200">
              {conflict.message || "An active watch party already exists for this title."}
            </p>
            <div className="mt-3 space-y-2">
              {existingParties.map((party) => (
                <div key={party.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{party.partyName}</p>
                      <p className="text-xs text-gray-400">
                        Host: {party.hostUsername} | Viewers: {party.viewerCount}/{party.maxViewers}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        onClick={() => joinWithInvite(party.id, party.partySlug)}
                        disabled={busyPartyId === party.id}
                      >
                        Join
                      </Button>
                      <Button
                        buttonType="ghost"
                        buttonSize="sm"
                        onClick={() => requestJoin(party.id)}
                        disabled={busyPartyId === party.id}
                      >
                        Request Access
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {canCreateAnother ? (
              <div className="mt-3">
                <Button buttonType="warning" buttonSize="sm" onClick={() => create(true)} disabled={submitting}>
                  Create New Party Anyway
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-amber-100/90">This title has reached the 3 active parties limit.</p>
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button buttonType="ghost" buttonSize="sm" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button buttonType="primary" buttonSize="sm" onClick={() => create(false)} disabled={submitting}>
            {submitting ? "Creating..." : "Create Party"}
          </Button>
        </div>
      </div>
      )}
    </Modal>
  );
}
