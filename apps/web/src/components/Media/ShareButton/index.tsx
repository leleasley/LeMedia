"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import Button from "@/components/Common/Button";
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
      <Button
        buttonType="ghost"
        buttonSize="sm"
        onClick={() => setIsModalOpen(true)}
        className="media-action-button"
      >
        <Share2 className="h-4 w-4" />
        <span>Share</span>
      </Button>

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
