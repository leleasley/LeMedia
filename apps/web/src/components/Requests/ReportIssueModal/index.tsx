"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { csrfFetch } from "@/lib/csrf-client";
import { AlertTriangle } from "lucide-react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

type IssueCategory = "video" | "audio" | "subtitle" | "other";

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  video: "Video",
  audio: "Audio",
  subtitle: "Subtitle",
  other: "Other"
};

export function ReportIssueModal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  backdropUrl?: string | null;
}) {
  const { open, onClose, title, mediaType, tmdbId, backdropUrl } = props;
  const [category, setCategory] = useState<IssueCategory>("video");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = message.trim().length >= 5;

  // Lock body scroll when modal is open
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    setCategory("video");
    setMessage("");
    setError(null);
  }, [open]);

  const backgroundStyle = useMemo(() => {
    if (!backdropUrl) return undefined;
    return {
      backgroundImage: `linear-gradient(180deg, rgba(10,16,28,0.25) 0%, rgba(12,18,28,0.95) 70%), url(${backdropUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    } as React.CSSProperties;
  }, [backdropUrl]);

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/v1/issues/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mediaType,
          tmdbId,
          title,
          category,
          description: message.trim()
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to submit issue");
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit issue");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#151c2b] shadow-2xl">
        <div className="relative px-6 py-5" style={backgroundStyle}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold text-violet-300">Report an Issue</div>
              <div className="text-lg font-semibold text-white">{title}</div>
            </div>
            <button
              type="button"
              className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70 hover:text-white"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#1a2234]">
            {(["video", "audio", "subtitle", "other"] as IssueCategory[]).map((opt, index, arr) => (
              <label
                key={opt}
                className={`flex items-center gap-3 px-4 py-3 text-sm text-white/90 cursor-pointer ${index < arr.length - 1 ? "border-b border-white/10" : ""}`}
              >
                <input
                  type="radio"
                  name="issue-type"
                  value={opt}
                  checked={category === opt}
                  onChange={() => setCategory(opt)}
                />
                <span>{CATEGORY_LABELS[opt]}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="text-sm font-semibold text-white/80">
              What&apos;s wrong? <span className="text-red-400">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please provide a detailed explanation of the issue you encountered."
              className="mt-2 h-32 w-full resize-none rounded-xl border border-white/10 bg-[#20293b] p-4 text-sm text-white placeholder:text-white/40 focus:border-violet-400 focus:outline-none"
            />
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={submit}
              disabled={!canSubmit || saving}
            >
              {saving ? "Submitting..." : "Submit Issue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
