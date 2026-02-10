"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { StarIcon } from "@heroicons/react/24/solid";
import { getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";

type RequestedBy = {
  username: string;
  avatarUrl?: string | null;
  jellyfinUserId?: string | null;
};

type MediaSocialPanelProps = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  requestedBy?: RequestedBy | null;
  initialWatchlist?: boolean | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/g).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function MediaSocialPanel({ tmdbId, mediaType, requestedBy, initialWatchlist }: MediaSocialPanelProps) {
  const [watchlist, setWatchlist] = useState<boolean | null>(initialWatchlist ?? null);

  useEffect(() => {
    if (initialWatchlist != null) return;
    let active = true;
    fetch(`/api/v1/media-list?tmdbId=${tmdbId}&mediaType=${mediaType}`, { credentials: "include" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active || !data) return;
        setWatchlist(Boolean(data.watchlist));
      })
      .catch(() => {
        if (active) setWatchlist(null);
      });
    return () => {
      active = false;
    };
  }, [tmdbId, mediaType]);

  const requestedLabel = useMemo(() => {
    if (!requestedBy?.username) return null;
    return `Requested by ${requestedBy.username}`;
  }, [requestedBy?.username]);

  if (watchlist === null && !requestedBy) return null;

  const avatarSrc = requestedBy
    ? (requestedBy.jellyfinUserId ? `/avatarproxy/${requestedBy.jellyfinUserId}` : getAvatarSrc({
        avatarUrl: requestedBy.avatarUrl,
        jellyfinUserId: requestedBy.jellyfinUserId ?? null,
        username: requestedBy.username
      }))
    : null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {watchlist !== null && (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-200">
          <StarIcon className={`h-3.5 w-3.5 ${watchlist ? "text-yellow-400" : "text-gray-400"}`} />
          {watchlist ? "In your watchlist" : "Not in watchlist"}
        </div>
      )}
      {requestedLabel && (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-200">
          {avatarSrc ? (
            <span className="relative h-5 w-5 overflow-hidden rounded-full border border-white/10 bg-black/40">
              <Image
                src={avatarSrc}
                alt={requestedBy?.username ?? "User"}
                fill
                className="object-cover"
                unoptimized={shouldBypassNextImage(avatarSrc)}
              />
            </span>
          ) : (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-black/40 text-[10px] text-gray-300">
              {initials(requestedBy?.username ?? "User")}
            </span>
          )}
          <span className="inline-flex items-center gap-1">{requestedLabel}</span>
        </div>
      )}
    </div>
  );
}
