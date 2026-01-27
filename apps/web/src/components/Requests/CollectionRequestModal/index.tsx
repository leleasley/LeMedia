"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Modal } from "@/components/Common/Modal";
import { csrfFetch } from "@/lib/csrf-client";
import { Check, Loader2, X } from "lucide-react";

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
      title="Request Collection"
      onClose={props.onClose}
      backgroundImage={backgroundImage}
    >
      <div className="space-y-4">
        <div className="text-sm text-muted">{props.collectionName}</div>
        {props.requestsBlocked ? (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {blockedMessage}
          </div>
        ) : (
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted">
            This request will be approved automatically.
          </div>
        )}

        <div className="space-y-2">
          {props.movies.map(movie => {
            const effectiveStatus = statusById[movie.id] ?? movie.status;
            const disabled = effectiveStatus && effectiveStatus !== "available";
            const checked = (selected[movie.id] ?? selectable[movie.id]) && !disabled;
            return (
              <label key={movie.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || submitting}
                  onChange={(e) => setSelected(prev => ({ ...prev, [movie.id]: e.target.checked }))}
                />
                <div className="relative h-12 w-9 overflow-hidden rounded bg-black/30">
                  {movie.posterPath ? (
                    <Image src={movie.posterPath} alt={movie.title} fill sizes="40px" className="object-cover" />
                  ) : null}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">{movie.title}</div>
                  <div className="text-xs text-muted">{movie.releaseDate?.slice(0, 4) || "Unknown year"}</div>
                </div>
                {effectiveStatus && effectiveStatus !== "available" ? (
                  <span className="rounded-full bg-slate-700/60 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-200">
                    {effectiveStatus.replace(/_/g, " ")}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>

        {loadingStatus ? <div className="text-xs text-muted">Checking collection availability...</div> : null}

        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-muted">Quality profile</label>
          <select
            className="mt-2 w-full"
            value={profileId}
            onChange={(e) => setProfileId(Number(e.target.value))}
            disabled={submitting}
          >
            {props.qualityProfiles.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>

        {result ? (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              submitState === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : submitState === "error"
                ? "border-red-500/40 bg-red-500/10 text-red-200"
                : "border-white/10 bg-white/5 text-muted"
            }`}
          >
            {result}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={props.onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className={`btn flex items-center gap-2 ${
              submitState === "success"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : submitState === "error"
                ? "bg-red-600 hover:bg-red-700"
                : ""
            }`}
            onClick={submit}
            disabled={submitting}
          >
            {submitState === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitState === "success" && <Check className="h-4 w-4" />}
            {submitState === "error" && <X className="h-4 w-4" />}
            {submitState === "loading"
              ? "Requesting..."
              : submitState === "success"
              ? "Success"
              : submitState === "error"
              ? "Failed"
              : "Request movies"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
