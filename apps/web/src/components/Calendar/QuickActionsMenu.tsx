"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical, Download, Heart, Bell, Play, ExternalLink, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: string;
  tmdbId?: number;
  tvdbId?: number;
  posterPath?: string | null;
  backdropPath?: string | null;
  mediaType?: "movie" | "tv";
  metadata?: {
    isAvailable?: boolean;
    jellyfinItemId?: string | null;
    requestId?: string;
    status?: string;
    seasonNumber?: number;
    episodeNumber?: number;
  };
}

interface QuickActionsMenuProps {
  event: CalendarEvent;
  onActionComplete?: () => void;
}

export function QuickActionsMenu({ event, onActionComplete }: QuickActionsMenuProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [isAddingToWatchlist, setIsAddingToWatchlist] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const canRequest = event.tmdbId && event.mediaType && !event.metadata?.requestId;
  const canAddToWatchlist = event.tmdbId && event.mediaType;
  const canNotify = event.tmdbId && event.mediaType && !event.metadata?.isAvailable;
  const canWatchInJellyfin = event.metadata?.isAvailable && event.metadata?.jellyfinItemId;

  const handleRequest = async () => {
    if (!event.tmdbId || !event.mediaType) return;

    setIsRequesting(true);
    try {
      const response = await fetch("/api/v1/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaType: event.mediaType,
          mediaId: event.tmdbId,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(error.error || "Request failed");
      }

      toast.success(`Requested: ${event.title}`);
      onActionComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to request";
      toast.error(message);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleAddToWatchlist = async () => {
    if (!event.tmdbId || !event.mediaType) return;

    setIsAddingToWatchlist(true);
    try {
      const response = await fetch("/api/media-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listType: "watchlist",
          mediaType: event.mediaType,
          tmdbId: event.tmdbId,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to add" }));
        throw new Error(error.error || "Failed to add to watchlist");
      }

      toast.success(`Added to watchlist: ${event.title}`);
      onActionComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add to watchlist";
      toast.error(message);
    } finally {
      setIsAddingToWatchlist(false);
    }
  };

  const handleSubscribeNotification = async () => {
    if (!event.tmdbId || !event.mediaType) return;

    setIsSubscribing(true);
    try {
      const response = await fetch("/api/calendar/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType: event.type,
          tmdbId: event.tmdbId,
          seasonNumber: event.metadata?.seasonNumber,
          episodeNumber: event.metadata?.episodeNumber,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Subscription failed" }));
        throw new Error(error.error || "Subscription failed");
      }

      toast.success(`You'll be notified when ${event.title} is available`);
      onActionComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to subscribe";
      toast.error(message);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleWatchInJellyfin = () => {
    const jellyfinUrl = process.env.NEXT_PUBLIC_JELLYFIN_URL || "";
    const itemId = event.metadata?.jellyfinItemId;

    if (!jellyfinUrl || !itemId) {
      toast.error("Jellyfin not configured");
      return;
    }

    window.open(`${jellyfinUrl}/web/index.html#!/details?id=${itemId}`, "_blank");
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800/50 text-gray-400 hover:bg-gray-700 hover:text-white transition-all"
          aria-label="Actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] rounded-lg border border-gray-700 bg-gray-800 shadow-xl"
          sideOffset={5}
          align="end"
        >
          <div className="p-1">
            {canRequest && (
              <DropdownMenu.Item asChild>
                <button
                  type="button"
                  onClick={handleRequest}
                  disabled={isRequesting}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isRequesting
                      ? "cursor-not-allowed text-gray-500"
                      : "text-gray-300 hover:bg-gray-700/50 hover:text-white"
                  )}
                >
                  {isRequesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 text-blue-400" />
                  )}
                  <span>Request</span>
                </button>
              </DropdownMenu.Item>
            )}

            {canAddToWatchlist && (
              <DropdownMenu.Item asChild>
                <button
                  type="button"
                  onClick={handleAddToWatchlist}
                  disabled={isAddingToWatchlist}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isAddingToWatchlist
                      ? "cursor-not-allowed text-gray-500"
                      : "text-gray-300 hover:bg-gray-700/50 hover:text-white"
                  )}
                >
                  {isAddingToWatchlist ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Heart className="h-4 w-4 text-pink-400" />
                  )}
                  <span>Add to Watchlist</span>
                </button>
              </DropdownMenu.Item>
            )}

            {canNotify && (
              <DropdownMenu.Item asChild>
                <button
                  type="button"
                  onClick={handleSubscribeNotification}
                  disabled={isSubscribing}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isSubscribing
                      ? "cursor-not-allowed text-gray-500"
                      : "text-gray-300 hover:bg-gray-700/50 hover:text-white"
                  )}
                >
                  {isSubscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bell className="h-4 w-4 text-yellow-400" />
                  )}
                  <span>Notify When Available</span>
                </button>
              </DropdownMenu.Item>
            )}

            {canWatchInJellyfin && (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-gray-700" />
                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    onClick={handleWatchInJellyfin}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
                  >
                    <Play className="h-4 w-4 text-green-400" />
                    <span>Watch in Jellyfin</span>
                    <ExternalLink className="ml-auto h-3 w-3 text-gray-500" />
                  </button>
                </DropdownMenu.Item>
              </>
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
