"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

type MediaReaction = {
  id: number;
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  emoji: string;
  worthWatching: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type AggregateResponse = {
  me: MediaReaction | null;
  reactions: MediaReaction[];
  summary: Array<{ emoji: string; count: number }>;
  worthWatching: { yes: number; no: number };
};

const EMOJI_OPTIONS = ["🔥", "❤️", "🤯", "😂", "😮", "🎯"];

const fetcher = async (url: string): Promise<AggregateResponse> => {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load reactions");
  return await res.json();
};

export function MediaReactionsPanel({
  mediaType,
  tmdbId,
  mediaTitle,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  mediaTitle: string;
}) {
  const toast = useToast();
  const endpoint = `/api/v1/social/media-reactions/${mediaType}/${tmdbId}`;
  const { data, mutate, isLoading } = useSWR<AggregateResponse>(endpoint, fetcher, {
    revalidateOnFocus: false,
  });

  const [emoji, setEmoji] = useState<string>("🔥");
  const [worthWatching, setWorthWatching] = useState<boolean>(true);
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const summaryText = !data?.summary?.length
    ? "No reactions yet"
    : data.summary.slice(0, 3).map((item) => `${item.emoji} ${item.count}`).join("  ");

  const me = data?.me ?? null;

  async function saveReaction() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await csrfFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          emoji,
          worthWatching,
          note: note.trim() || null,
          mediaTitle,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to save reaction");
      await mutate(payload, { revalidate: false });
      toast.success("Reaction saved");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save reaction");
    } finally {
      setSaving(false);
    }
  }

  async function removeReaction() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await csrfFetch(endpoint, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to clear reaction");
      await mutate(payload, { revalidate: false });
      setNote("");
      toast.success("Reaction removed");
    } catch (error: any) {
      toast.error(error?.message || "Failed to clear reaction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-black/20 mt-4">
      {/* Compact summary bar — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/5 rounded-xl"
      >
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/45 shrink-0">Reactions</p>
          <p className="text-xs text-white/70 truncate">{summaryText}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-white/50">
            <span className="text-emerald-300">{data?.worthWatching?.yes ?? 0}</span>
            {" / "}
            <span className="text-rose-300">{data?.worthWatching?.no ?? 0}</span>
          </span>
          <svg className={`h-3.5 w-3.5 text-white/40 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>

      {/* Expandable form */}
      {expanded ? (
        <div className="border-t border-white/10 px-3.5 py-3 space-y-3">
          {/* Emoji selector + worth watching — single row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {EMOJI_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setEmoji(option)}
                className={`rounded-md px-1.5 py-0.5 text-base border transition ${emoji === option
                  ? "border-sky-300/60 bg-sky-400/20"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
                aria-label={`React with ${option}`}
              >
                {option}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-white/10" />
            <button
              type="button"
              onClick={() => setWorthWatching(true)}
              className={`rounded-md border px-2 py-0.5 text-xs transition ${worthWatching ? "border-emerald-300/60 bg-emerald-500/20 text-emerald-100" : "border-white/10 bg-white/5 text-white/60"}`}
            >
              Worth it
            </button>
            <button
              type="button"
              onClick={() => setWorthWatching(false)}
              className={`rounded-md border px-2 py-0.5 text-xs transition ${!worthWatching ? "border-rose-300/60 bg-rose-500/20 text-rose-100" : "border-white/10 bg-white/5 text-white/60"}`}
            >
              Skip
            </button>
          </div>

          {/* Note + submit in a compact row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 180))}
              placeholder="Spoiler-free vibe (optional)"
              className="flex-1 min-w-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/25"
            />
            <button
              type="button"
              disabled={saving || isLoading}
              onClick={() => void saveReaction()}
              className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-60"
            >
              {saving ? "..." : me ? "Update" : "Post"}
            </button>
            {me ? (
              <button
                type="button"
                disabled={saving || isLoading}
                onClick={() => void removeReaction()}
                className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/10 disabled:opacity-60"
              >
                Remove
              </button>
            ) : null}
          </div>

          {/* Friend reactions list */}
          {data?.reactions?.length ? (
            <div className="space-y-1.5 border-t border-white/10 pt-2">
              {data.reactions.slice(0, 6).map((reaction) => (
                <div key={reaction.id} className="flex items-center gap-2 text-xs text-white/80">
                  <span>{reaction.emoji}</span>
                  <span className="font-medium">{reaction.displayName || reaction.username}</span>
                  <span className={reaction.worthWatching ? "text-emerald-300/80" : "text-rose-300/80"}>
                    {reaction.worthWatching ? "👍" : "👎"}
                  </span>
                  {reaction.note ? <span className="text-white/50 truncate">{reaction.note}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
