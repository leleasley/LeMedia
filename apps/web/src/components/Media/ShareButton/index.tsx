"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { ShareModal } from "@/components/Media/ShareModal";

interface ShareButtonProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  backdropPath: string | null;
  posterUrl?: string | null;
}

export function ShareButton({ mediaType, tmdbId, title, backdropPath, posterUrl }: ShareButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-800 border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
      >
        <Share2 className="h-4 w-4" />
        Share
      </button>

      <ShareModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mediaType={mediaType}
        tmdbId={tmdbId}
        title={title}
        backdropPath={backdropPath}
        posterUrl={posterUrl}
      />
    </>
  );
}
