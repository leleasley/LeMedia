"use client";

import useSWR from "swr";
import Image from "next/image";
import { Bell, Clapperboard, Film, Loader2, Trash2, Tv } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";

type FollowedMediaItem = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  theatricalReleaseDate: string | null;
  digitalReleaseDate: string | null;
  notifyOnTheatrical: boolean;
  notifyOnDigital: boolean;
  notifiedTheatricalAt: string | null;
  notifiedDigitalAt: string | null;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((res) => res.json());

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function isPastOrToday(dateStr: string | null, todayIso: string) {
  if (!dateStr) return false;
  return dateStr <= todayIso;
}

function followLink(item: FollowedMediaItem) {
  return item.mediaType === "movie" ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;
}

function posterUrl(path: string | null) {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/w500${path}`;
}

export function FollowingPageClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: FollowedMediaItem[]; todayIso?: string }>("/api/following", fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 60_000,
  });

  const items = Array.isArray(data?.items) ? data!.items : [];
  const todayIso = data?.todayIso ?? new Date().toISOString().slice(0, 10);

  const removeFollow = async (item: FollowedMediaItem) => {
    try {
      const res = await csrfFetch("/api/following", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) throw new Error("Failed to unfollow");
      toast.success(`Stopped following ${item.title}`);
      mutate();
    } catch {
      toast.error("Failed to unfollow media");
    }
  };

  const toggleOption = async (item: FollowedMediaItem, key: "notifyOnTheatrical" | "notifyOnDigital") => {
    const next = !Boolean(item[key]);
    try {
      const payload: Record<string, unknown> = { id: item.id };
      payload[key] = next;
      const res = await csrfFetch("/api/following", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update");
      mutate();
    } catch {
      toast.error("Failed to update follow options");
    }
  };

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-sky-500/5 to-transparent p-6 md:p-8">
        <div className="relative">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-sky-500/20 ring-1 ring-white/10">
              <Bell className="h-7 w-7 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Following</h1>
              <p className="text-sm text-white/60 mt-1">Track theatrical/premiere and digital release moments for titles you care about.</p>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center text-gray-400">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">Loading followed titles...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center text-gray-400">
          <Film className="mx-auto h-10 w-10 text-gray-500" />
          <h2 className="mt-3 text-lg font-semibold text-white">No followed titles yet</h2>
          <p className="mt-2 text-sm">Open any movie or TV page and tap the bell button to follow it.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const poster = posterUrl(item.posterPath);
            const theatricalReleased = isPastOrToday(item.theatricalReleaseDate, todayIso);
            const digitalReleased = isPastOrToday(item.digitalReleaseDate, todayIso);

            return (
              <article key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex gap-3">
                  <PrefetchLink href={followLink(item)} className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/30">
                    {poster ? (
                      <Image src={poster} alt={item.title} fill className="object-cover" sizes="64px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-500">
                        {item.mediaType === "movie" ? <Film className="h-4 w-4" /> : <Tv className="h-4 w-4" />}
                      </div>
                    )}
                  </PrefetchLink>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <PrefetchLink href={followLink(item)} className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-white">{item.title}</h2>
                        <p className="mt-0.5 text-xs text-gray-400">{item.mediaType === "movie" ? "Movie" : "TV"}</p>
                      </PrefetchLink>
                      <button
                        type="button"
                        onClick={() => void removeFollow(item)}
                        className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20"
                        title="Unfollow"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      <label className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-gray-300 inline-flex items-center gap-1.5">
                          <Clapperboard className="h-3.5 w-3.5 text-amber-300" />
                          {item.mediaType === "movie" ? `Theatrical: ${formatDate(item.theatricalReleaseDate)}` : `Premiere: ${formatDate(item.theatricalReleaseDate)}`}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={item.notifyOnTheatrical}
                          onClick={() => void toggleOption(item, "notifyOnTheatrical")}
                          disabled={theatricalReleased}
                          className={`ui-switch ui-switch-sm transition-colors ${item.notifyOnTheatrical ? "bg-cyan-600" : "bg-gray-700"} ${theatricalReleased ? "opacity-50" : ""}`}
                        >
                          <span className={`ui-switch-thumb ${item.notifyOnTheatrical ? "translate-x-6" : "translate-x-0"}`} />
                        </button>
                      </label>

                      {item.mediaType === "movie" && (
                        <label className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-gray-300 inline-flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5 text-cyan-300" />
                            Digital: {formatDate(item.digitalReleaseDate)}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={item.notifyOnDigital}
                            onClick={() => void toggleOption(item, "notifyOnDigital")}
                            disabled={digitalReleased}
                            className={`ui-switch ui-switch-sm transition-colors ${item.notifyOnDigital ? "bg-cyan-600" : "bg-gray-700"} ${digitalReleased ? "opacity-50" : ""}`}
                          >
                            <span className={`ui-switch-thumb ${item.notifyOnDigital ? "translate-x-6" : "translate-x-0"}`} />
                          </button>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
