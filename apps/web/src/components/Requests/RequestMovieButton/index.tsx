"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Common/Modal";
import { readJson } from "@/lib/fetch-utils";
import { csrfFetch } from "@/lib/csrf-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type QualityProfile = { id: number; name: string };

export function RequestMovieButton(props: {
  tmdbId: number;
  qualityProfiles: QualityProfile[];
  defaultQualityProfileId: number;
  requestsBlocked?: boolean;
}) {
  const [status, setStatus] = useState<string>("");
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<number>(props.defaultQualityProfileId);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const blockedMessage = "Requesting blocked until notifications are applied";

  async function submit() {
    if (isSubmitting) return;
    if (props.requestsBlocked) {
      setModal({ title: "Requesting blocked", message: blockedMessage });
      setStatus("");
      return;
    }
    setIsSubmitting(true);
    setStatus("Submitting to Radarr...");
    try {
      const res = await csrfFetch("/api/v1/request/movie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: props.tmdbId, qualityProfileId: selectedQualityProfileId })
      });
      const j = await readJson(res);
      if (!res.ok) {
        const code = j?.error;
        if (code === "notifications_required") {
          setModal({ title: "Requesting blocked", message: blockedMessage });
          setStatus("");
          return;
        }
        if (res.status === 409 && (code === "already_requested" || code === "already_in_radarr")) {
          setModal({
            title: code === "already_in_radarr" ? "Already in Radarr" : "Already requested",
            message: j?.message || "This movie has already been requested or already exists."
          });
          setStatus("");
          return;
        }
        throw new Error(j?.error || j?.message || "Request failed");
      }
      if (j?.pending) {
        setModal({
          title: "Sent for approval",
          message: "An admin needs to approve this request before it is added."
        });
        setStatus("");
        router.refresh();
        return;
      }
      setStatus(`Submitted. Request ID: ${j.requestId}`);
      router.refresh();
    } catch (e: any) {
      setStatus(`Failed: ${e?.message ?? String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <Modal
        open={!!modal}
        title={modal?.title ?? ""}
        onClose={() => setModal(null)}
      >
        {modal?.message ?? ""}
      </Modal>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs text-muted uppercase tracking-[0.3em]">Quality</label>
        <Select
          value={String(selectedQualityProfileId)}
          onValueChange={(value) => setSelectedQualityProfileId(Number(value))}
          disabled={isSubmitting}
        >
          <SelectTrigger className="min-w-[180px]">
            <SelectValue placeholder="Select quality" />
          </SelectTrigger>
          <SelectContent>
            {props.qualityProfiles.map((profile) => (
              <SelectItem key={profile.id} value={String(profile.id)}>
                {profile.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <button
        onClick={submit}
        className="btn"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Requesting..." : "Request in Radarr"}
      </button>
      {props.requestsBlocked ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {blockedMessage}
        </div>
      ) : null}
      {status ? <div className="text-sm text-muted">{status}</div> : null}
    </div>
  );
}
