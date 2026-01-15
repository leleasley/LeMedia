"use client";

import { useEffect, useState } from "react";
import { HeartIcon, StarIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid, StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import Button from "@/components/Common/Button";

type MediaType = "movie" | "tv";

export function MediaListButtons({
  tmdbId,
  mediaType,
  className,
}: {
  tmdbId: number;
  mediaType: MediaType;
  className?: string;
}) {
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/v1/media-list?tmdbId=${tmdbId}&mediaType=${mediaType}`, { credentials: "include" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active || !data) return;
        setFavorite(Boolean(data.favorite));
        setWatchlist(Boolean(data.watchlist));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tmdbId, mediaType]);

  const toggle = async (listType: "favorite" | "watchlist") => {
    if (saving) return;
    setSaving(true);
    const isActive = listType === "favorite" ? favorite : watchlist;
    const method = isActive ? "DELETE" : "POST";
    try {
      const res = await csrfFetch("/api/v1/media-list", {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listType, mediaType, tmdbId })
      });
      if (!res.ok) throw new Error("Request failed");
      if (listType === "favorite") {
        setFavorite(!isActive);
        toast.success(
          !isActive ? "Added to your favorites" : "Removed from your favorites",
          { timeoutMs: 3000 }
        );
      }
      if (listType === "watchlist") {
        setWatchlist(!isActive);
        toast.success(
          !isActive ? "Added to your watchlist" : "Removed from your watchlist",
          { timeoutMs: 3000 }
        );
      }
    } catch (error) {
      toast.error("Failed to update list", { timeoutMs: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        buttonType="ghost"
        buttonSize="md"
        onClick={() => toggle("favorite")}
        disabled={loading || saving}
        className="z-40"
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={favorite}
      >
        {favorite ? (
          <HeartIconSolid className="h-4 w-4 text-red-500" />
        ) : (
          <HeartIcon className="h-4 w-4 text-red-500" />
        )}
      </Button>
      <Button
        buttonType="ghost"
        buttonSize="md"
        onClick={() => toggle("watchlist")}
        disabled={loading || saving}
        className="z-40"
        aria-label={watchlist ? "Remove from watchlist" : "Add to watchlist"}
        aria-pressed={watchlist}
      >
        {watchlist ? (
          <StarIconSolid className="h-4 w-4 text-yellow-500" />
        ) : (
          <StarIcon className="h-4 w-4 text-yellow-500" />
        )}
      </Button>
    </div>
  );
}
