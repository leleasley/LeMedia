"use client";

import { useEffect, useState } from "react";
import { HeartIcon, StarIcon, ListBulletIcon, BellIcon, EyeIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid, StarIcon as StarIconSolid, BellIcon as BellIconSolid, EyeIcon as EyeIconSolid } from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import Button from "@/components/Common/Button";
import { AddToListModal } from "@/components/Lists";

type MediaType = "movie" | "tv";

export function MediaListButtons({
  tmdbId,
  mediaType,
  className,
  initialFavorite,
  initialWatchlist,
  initialWatched,
  title,
}: {
  tmdbId: number;
  mediaType: MediaType;
  className?: string;
  initialFavorite?: boolean | null;
  initialWatchlist?: boolean | null;
  initialWatched?: boolean | null;
  title?: string;
}) {
  const [favorite, setFavorite] = useState(Boolean(initialFavorite));
  const [watchlist, setWatchlist] = useState(Boolean(initialWatchlist));
  const [watched, setWatched] = useState(Boolean(initialWatched));
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(initialFavorite == null || initialWatchlist == null || initialWatched == null);
  const [saving, setSaving] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (initialFavorite != null && initialWatchlist != null && initialWatched != null) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/v1/media-list?tmdbId=${tmdbId}&mediaType=${mediaType}`, { credentials: "include" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active || !data) return;
        setFavorite(Boolean(data.favorite));
        setWatchlist(Boolean(data.watchlist));
        setWatched(Boolean(data.watched));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    fetch(`/api/following/status?tmdbId=${tmdbId}&mediaType=${mediaType}`, { credentials: "include" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active || !data) return;
        setFollowed(Boolean(data.followed));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [tmdbId, mediaType, initialFavorite, initialWatchlist, initialWatched]);

  const toggleFollow = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = followed
        ? await csrfFetch("/api/following", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaType, tmdbId })
        })
        : await csrfFetch("/api/following", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaType, tmdbId })
        });
      if (!res.ok) throw new Error("Request failed");
      setFollowed(!followed);
      toast.success(!followed ? "Now following this title" : "Stopped following this title", { timeoutMs: 3000 });
    } catch {
      toast.error("Failed to update follow status", { timeoutMs: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (listType: "favorite" | "watchlist" | "watched") => {
    if (saving) return;
    setSaving(true);
    const isActive = listType === "favorite" ? favorite : (listType === "watchlist" ? watchlist : watched);
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
      if (listType === "watched") {
        setWatched(!isActive);
        toast.success(
          !isActive ? "Marked as watched" : "Marked as unwatched",
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
    <>
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
        <Button
          buttonType="ghost"
          buttonSize="md"
          onClick={() => toggle("watched")}
          disabled={loading || saving}
          className="z-40"
          aria-label={watched ? "Mark as unwatched" : "Mark as watched"}
          aria-pressed={watched}
        >
          {watched ? (
            <EyeIconSolid className="h-4 w-4 text-emerald-400" />
          ) : (
            <EyeIcon className="h-4 w-4 text-emerald-400" />
          )}
        </Button>
        <Button
          buttonType="ghost"
          buttonSize="md"
          onClick={toggleFollow}
          disabled={loading || saving}
          className="z-40"
          aria-label={followed ? "Unfollow release notifications" : "Follow release notifications"}
          aria-pressed={followed}
        >
          {followed ? (
            <BellIconSolid className="h-4 w-4 text-cyan-400" />
          ) : (
            <BellIcon className="h-4 w-4 text-cyan-400" />
          )}
        </Button>
        <Button
          buttonType="ghost"
          buttonSize="md"
          onClick={() => setListModalOpen(true)}
          disabled={loading}
          className="z-40"
          aria-label="Add to list"
        >
          <ListBulletIcon className="h-4 w-4 text-blue-500" />
        </Button>
      </div>
      <AddToListModal
        open={listModalOpen}
        onClose={() => setListModalOpen(false)}
        tmdbId={tmdbId}
        mediaType={mediaType}
        title={title ?? "Unknown"}
      />
    </>
  );
}
