"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Common/Modal";
import { readJson } from "@/lib/fetch-utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import AdvancedRequester, { RequestOverrides } from "@/components/Requests/AdvancedRequester";
import { Check, X, Loader2, Eye } from "lucide-react";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { ReleaseSearchModal } from "@/components/Media/ReleaseSearchModal";

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
  year,
  posterUrl,
  backdropUrl,
  onRequestPlaced,
  isLoading = false,
  monitor = true,
  isAdmin = false,
  prowlarrEnabled = false,
  serviceItemId = null,
  allowRaw = true
}: {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  mediaType: "movie" | "tv";
  qualityProfiles: QualityProfile[];
  defaultQualityProfileId: number;
  requestsBlocked?: boolean;
  title?: string;
  year?: string | number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  onRequestPlaced?: () => void;
  isLoading?: boolean;
  monitor?: boolean;
  isAdmin?: boolean;
  prowlarrEnabled?: boolean;
  serviceItemId?: number | null;
  allowRaw?: boolean;
}) {
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<number>(defaultQualityProfileId);
  const [overrides, setOverrides] = useState<RequestOverrides>({});
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [rawOpen, setRawOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const blockedMessage = "Requesting blocked until notifications are applied";
  const canOpenRaw = Boolean(isAdmin && prowlarrEnabled && allowRaw);

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
      setRawOpen(false);
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
          <div className="space-y-5">
            {/* Poster Preview */}
            {posterUrl && (
              <div className="flex items-center gap-4 p-3 rounded-xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-white/10">
                <div className="relative h-20 w-14 rounded-lg overflow-hidden shadow-lg flex-shrink-0">
                  <img src={posterUrl} alt={title} className="object-cover w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate">{title}</h3>
                  {year && <p className="text-xs text-gray-400 mt-1">{year}</p>}
                </div>
              </div>
            )}

            {/* Quality Profile Selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"></span>
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
              <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 text-lg">⚠️</span>
                  <span>{blockedMessage}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {isAdmin && allowRaw ? (
                <button
                  onClick={() => {
                    if (canOpenRaw) setRawOpen(true);
                  }}
                  disabled={!canOpenRaw}
                  title={canOpenRaw ? "View Raw releases" : "Set up Prowlarr in services"}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 backdrop-blur-sm"
                >
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">{canOpenRaw ? "View Raw" : "Set up Prowlarr"}</span>
                </button>
              ) : null}
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={isSubmitting || requestsBlocked}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg backdrop-blur-sm ${
                  submitState === "success"
                    ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                    : submitState === "error"
                    ? "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
                    : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                }`}
              >
                {submitState === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitState === "success" && <Check className="h-5 w-5" />}
                {submitState === "error" && <X className="h-5 w-5" />}
                <span>
                  {submitState === "loading"
                    ? "Requesting..."
                    : submitState === "success"
                    ? "Success!"
                    : submitState === "error"
                    ? "Failed"
                    : "Request"}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>
      {canOpenRaw ? (
        <ReleaseSearchModal
          open={rawOpen}
          onClose={() => setRawOpen(false)}
          mediaType={mediaType}
          mediaId={serviceItemId}
          tmdbId={tmdbId}
          tvdbId={null}
          title={requestTitle}
          year={year ?? null}
          posterUrl={posterUrl ?? null}
          backdropUrl={backdropUrl ?? null}
          preferProwlarr={prowlarrEnabled}
        />
      ) : null}
    </>
  );
}
