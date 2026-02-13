"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Modal } from "@/components/Common/Modal";
import { csrfFetch } from "@/lib/csrf-client";
import { Check, Loader2, X, Film, Star } from "lucide-react";

type MovieItem = {
  id: number;
  title: string;
  posterPath?: string | null;
  releaseDate?: string | null;
  status?: "available" | "requested" | "pending" | "submitted" | "already_exists" | "already_requested";
};

type QualityProfile = { id: number; name: string };

export function CollectionRequestModal(props: {
  open: boolean;
  onClose: () => void;
  collectionId: number;
  collectionName: string;
  movies: MovieItem[];
  qualityProfiles: QualityProfile[];
  defaultQualityProfileId: number;
  requestsBlocked?: boolean;
}) {
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [profileId, setProfileId] = useState<number>(props.defaultQualityProfileId);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string>("");
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusById, setStatusById] = useState<Record<number, MovieItem["status"]>>({});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const router = useRouter();

  const selectable = useMemo(() => {
    const initial: Record<number, boolean> = {};
    props.movies.forEach(movie => {
      const status = statusById[movie.id] ?? movie.status;
      if (!status || status === "available") {
        initial[movie.id] = true;
      } else {
        initial[movie.id] = false;
      }
    });
    return initial;
  }, [props.movies, statusById]);

  const selectedIds = useMemo(() => {
    const merged = { ...selectable, ...selected };
    return Object.entries(merged)
      .filter(([, value]) => value)
      .map(([key]) => Number(key));
  }, [selectable, selected]);

  const blockedMessage = "Requesting blocked until notifications are applied";

  useEffect(() => {
    if (!props.open) return;
    setSelected({});
    setResult("");
    setSubmitState("idle");
    const needsStatus = props.movies.some(movie => !movie.status);
    if (!needsStatus) return;
    setLoadingStatus(true);
    csrfFetch("/api/v1/radarr/collection-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbIds: props.movies.map(movie => movie.id) }),
      credentials: "include"
    })
      .then(async res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.statuses) return;
        setStatusById(data.statuses as Record<number, MovieItem["status"]>);
      })
      .catch(() => { })
      .finally(() => setLoadingStatus(false));
  }, [props.open, props.movies]);

  async function submit() {
    if (props.requestsBlocked) {
      setResult(blockedMessage);
      setSubmitState("error");
      return;
    }
    if (!selectedIds.length) {
      setResult("Select at least one movie to request.");
      setSubmitState("error");
      return;
    }
    setSubmitting(true);
    setResult("");
    setSubmitState("loading");
    try {
      const res = await csrfFetch("/api/v1/request/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: props.collectionId,
          tmdbIds: selectedIds,
          qualityProfileId: profileId
        }),
        credentials: "include"
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || body?.message || "Request failed");
      }
      const summary = Array.isArray(body?.results) ? body.results : [];
      const submitted = summary.filter((r: any) => ["submitted", "pending"].includes(r.status)).length;
      const skipped = summary.filter((r: any) => ["already_exists", "already_requested"].includes(r.status)).length;
      const failed = summary.filter((r: any) => r.status === "failed").length;
      setResult(`Requested ${submitted} movie(s). Skipped ${skipped}. Failed ${failed}.`);
      setSubmitState("success");
      router.refresh();
    } catch (err: any) {
      setResult(err?.message ?? "Unable to request collection");
      setSubmitState("error");
    } finally {
      setSubmitting(false);
    }
  }

  const backgroundImage =
    props.movies.find(movie => movie.posterPath)?.posterPath
    ?? props.movies[0]?.posterPath
    ?? undefined;

  return (
    <Modal
      open={props.open}
      title={`Request ${props.collectionName}`}
      onClose={props.onClose}
      backgroundImage={backgroundImage}
    >
      <div className="space-y-5">
        {/* Stats Bar */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-white/10">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-purple-400" />
            <span className="text-sm font-semibold text-white">{props.movies.length} Movies</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-emerald-400 font-semibold">{selectedIds.length}</span>
            <span>selected</span>
          </div>
        </div>

        {props.requestsBlocked ? (
          <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-4 py-3 text-sm text-amber-100">
            <div className="flex items-start gap-2">
              <span className="text-amber-400 text-lg">⚠️</span>
              <span>{blockedMessage}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-400 mt-0.5" />
              <span>This request will be approved automatically.</span>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
          {props.movies.map(movie => {
            const effectiveStatus = statusById[movie.id] ?? movie.status;
            const disabled = effectiveStatus && effectiveStatus !== "available";
            const checked = (selected[movie.id] ?? selectable[movie.id]) && !disabled;
            return (
              <label 
                key={movie.id} 
                className={`group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 transition-all duration-200 ${
                  disabled 
                    ? 'opacity-60 cursor-not-allowed' 
                    : 'hover:bg-white/10 hover:border-white/20 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || submitting}
                  onChange={(e) => setSelected(prev => ({ ...prev, [movie.id]: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-600 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-gray-800"
                />
                <div className="relative h-14 w-10 overflow-hidden rounded-lg bg-black/30 shadow-md flex-shrink-0">
                  {movie.posterPath ? (
                    <Image src={movie.posterPath} alt={movie.title} fill sizes="40px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="h-5 w-5 text-gray-600" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white line-clamp-1">{movie.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{movie.releaseDate?.slice(0, 4) || "Unknown year"}</div>
                </div>
                {effectiveStatus && effectiveStatus !== "available" ? (
                  <span className="rounded-full bg-gradient-to-r from-slate-700/60 to-slate-600/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-200 border border-slate-600/30">
                    {effectiveStatus.replace(/_/g, " ")}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>

        {loadingStatus ? (
          <div className="flex items-center gap-2 text-sm text-blue-400 animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking collection availability...</span>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"></span>
            Quality Profile
          </label>
          <select
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white hover:bg-white/10 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            value={profileId}
            onChange={(e) => setProfileId(Number(e.target.value))}
            disabled={submitting}
          >
            {props.qualityProfiles.map(profile => (
              <option key={profile.id} value={profile.id} className="bg-gray-900">
                {profile.name}
              </option>
            ))}
          </select>
        </div>

        {result ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-medium backdrop-blur-sm ${
              submitState === "success"
                ? "border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-green-500/10 text-emerald-200"
                : submitState === "error"
                ? "border-red-500/40 bg-gradient-to-r from-red-500/10 to-rose-500/10 text-red-200"
                : "border-white/10 bg-white/5 text-gray-300"
            }`}
          >
            <div className="flex items-start gap-2">
              {submitState === "success" && <Check className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />}
              {submitState === "error" && <X className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />}
              <span>{result}</span>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button 
            className="btn btn-ghost rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/10 transition-all duration-200" 
            onClick={props.onClose} 
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`btn flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg transition-all duration-200 ${
              submitState === "success"
                ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                : submitState === "error"
                ? "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
                : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            }`}
            onClick={submit}
            disabled={submitting || selectedIds.length === 0}
          >
            {submitState === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitState === "success" && <Check className="h-5 w-5" />}
            {submitState === "error" && <X className="h-5 w-5" />}
            {submitState === "loading"
              ? "Requesting..."
              : submitState === "success"
              ? "Success!"
              : submitState === "error"
              ? "Try Again"
              : `Request ${selectedIds.length} movie${selectedIds.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
