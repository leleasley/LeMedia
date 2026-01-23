"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Common/Modal";
import { readJson } from "@/lib/fetch-utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import AdvancedRequester, { RequestOverrides } from "@/components/Requests/AdvancedRequester";
import { Check, X, Loader2 } from "lucide-react";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

type QualityProfile = { id: number; name: string };

export function RequestMediaModal({
  open,
  onClose,
  tmdbId,
  mediaType,
  qualityProfiles,
  defaultQualityProfileId,
  requestsBlocked = false,
  title = "",
  posterUrl,
  backdropUrl,
  onRequestPlaced,
  isLoading = false,
  monitor = true
}: {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  mediaType: "movie" | "tv";
  qualityProfiles: QualityProfile[];
  defaultQualityProfileId: number;
  requestsBlocked?: boolean;
  title?: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  onRequestPlaced?: () => void;
  isLoading?: boolean;
  monitor?: boolean;
}) {
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<number>(defaultQualityProfileId);
  const [overrides, setOverrides] = useState<RequestOverrides>({});
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const router = useRouter();
  const toast = useToast();

  const blockedMessage = "Requesting blocked until notifications are applied";

  async function submit() {
    if (isSubmitting) return;
    if (requestsBlocked) {
      setErrorModal({ title: "Requesting blocked", message: blockedMessage });
      return;
    }
    setIsSubmitting(true);
    setSubmitState("loading");

    try {
      const endpoint = mediaType === "movie" ? "/api/v1/request/movie" : "/api/v1/request/tv";
      const body: any = {
        tmdbId,
        qualityProfileId: selectedQualityProfileId
      };

      if (mediaType === "tv") {
        body.monitor = monitor;
      }

      if (overrides.server) {
        body.serviceId = overrides.server;
      }
      if (overrides.language) {
        body.languageProfileId = overrides.language;
      }
      if (overrides.tags?.length) {
        body.tags = overrides.tags;
      }

      const res = await csrfFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const j = await readJson(res);

      if (!res.ok) {
        const code = j?.error;
        if (code === "notifications_required") {
          setErrorModal({ title: "Requesting blocked", message: blockedMessage });
          setSubmitState("error");
          setTimeout(() => setSubmitState("idle"), 2000);
          return;
        }
        if (res.status === 409 && (code === "already_requested" || code === "already_in_radarr" || code === "already_in_sonarr")) {
          setErrorModal({
            title: code.includes("radarr") || code.includes("sonarr") ? "Already Added" : "Already requested",
            message: j?.message || "This media has already been requested or already exists."
          });
          setSubmitState("error");
          setTimeout(() => setSubmitState("idle"), 2000);
          return;
        }
        throw new Error(j?.error || j?.message || "Request failed");
      }

      if (j?.pending) {
        toast.success("Request sent for approval! An admin needs to approve before it is added.", { timeoutMs: 4000 });
        setSubmitState("success");
        router.refresh();
        if (onRequestPlaced) onRequestPlaced();
        setTimeout(() => onClose(), 2000);
        return;
      }

      toast.success(`Request submitted successfully!`, { timeoutMs: 3000 });
      setSubmitState("success");
      router.refresh();
      if (onRequestPlaced) onRequestPlaced();
      setTimeout(() => onClose(), 1500);
    } catch (e: any) {
      toast.error(`Failed to submit request: ${e?.message ?? String(e)}`, { timeoutMs: 4000 });
      setSubmitState("error");
      setTimeout(() => setSubmitState("idle"), 2000);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setOverrides({});
      setSubmitState("idle");
      onClose();
    }
  };

  const requestTitle = title || (mediaType === "movie" ? "Movie" : "Series");

  return (
    <>
      <Modal open={!!errorModal} title={errorModal?.title ?? ""} onClose={() => setErrorModal(null)}>
        {errorModal?.message ?? ""}
      </Modal>
      
      <Modal 
        open={open} 
        title={`Request ${requestTitle}`} 
        onClose={handleClose}
        backgroundImage={backdropUrl ?? undefined}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="space-y-3 text-center">
              <div className="inline-flex">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-indigo-500"></div>
              </div>
              <p className="text-sm text-gray-400">Loading request options...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quality Profile Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Quality Profile
              </label>
              <AdaptiveSelect
                value={String(selectedQualityProfileId)}
                onValueChange={(value) => setSelectedQualityProfileId(Number(value))}
                disabled={isSubmitting}
                options={qualityProfiles.map((profile) => ({
                  value: String(profile.id),
                  label: profile.name
                }))}
                placeholder="Select quality profile"
                className="w-full"
              />
            </div>

            <AdvancedRequester
              mediaType={mediaType}
              is4k={false}
              onChange={setOverrides}
            />

            {/* Warning if blocked */}
            {requestsBlocked && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {blockedMessage}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={isSubmitting || requestsBlocked}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  submitState === "success"
                    ? "bg-green-600 hover:bg-green-700"
                    : submitState === "error"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {submitState === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitState === "success" && <Check className="h-4 w-4" />}
                {submitState === "error" && <X className="h-4 w-4" />}
                <span>
                  {submitState === "loading"
                    ? "Requesting..."
                    : submitState === "success"
                    ? "Success"
                    : submitState === "error"
                    ? "Failed"
                    : "Request"}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
