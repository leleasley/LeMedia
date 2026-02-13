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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      {/* Outer wrapper for animated gradient border */}
      <div className="relative w-full max-w-2xl animate-in zoom-in-95 fade-in duration-300">
        {/* Animated gradient border glow */}
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 opacity-60 blur-sm animate-pulse" />
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 opacity-30" />
        
        {/* Main modal container */}
        <div className="relative w-full rounded-2xl bg-gradient-to-b from-gray-900/95 via-gray-900/98 to-gray-950 border border-white/10 shadow-[0_0_50px_rgba(139,92,246,0.15)] backdrop-blur-2xl overflow-hidden">
          {/* Header */}
          <div className="relative px-6 py-5">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-purple-500/5 to-fuchsia-500/5" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl bg-violet-500 opacity-20 blur-lg" />
                  <div className="relative rounded-xl p-2.5 bg-violet-500/10 border border-violet-500/20">
                    <AlertTriangle className="h-5 w-5 text-violet-400" />
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Report an Issue</h2>
                  <p className="text-sm text-gray-400">{title}</p>
                </div>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                onClick={onClose}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 space-y-5">
            {/* Category selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-violet-400 to-purple-400" />
                Issue Category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["video", "audio", "subtitle", "other"] as IssueCategory[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setCategory(opt)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      category === opt 
                        ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25" 
                        : "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    {CATEGORY_LABELS[opt]}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-violet-400 to-purple-400" />
                Description <span className="text-red-400 text-xs">(required)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Please provide a detailed explanation of the issue you encountered..."
                className="w-full h-32 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-violet-500/50 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all duration-200"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit || saving}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Submitting..." : "Submit Issue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
