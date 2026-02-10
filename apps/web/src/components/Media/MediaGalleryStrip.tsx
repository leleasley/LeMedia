"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { Modal } from "@/components/Common/Modal";

export type GalleryImage = {
  url: string;
  label: string;
  type: "backdrop" | "poster";
};

export type TrailerItem = {
  name: string;
  url: string;
};

type MediaGalleryStripProps = {
  images?: GalleryImage[];
  trailers?: TrailerItem[];
};

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    let id: string | null = null;
    if (host === "youtu.be") {
      id = u.pathname.replace(/^\/+/, "") || null;
    } else if (host.endsWith("youtube.com")) {
      id = u.searchParams.get("v");
      if (!id && u.pathname.startsWith("/embed/")) id = u.pathname.split("/embed/")[1] || null;
    }

    if (!id) return null;
    id = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!id) return null;

    const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    embed.searchParams.set("autoplay", "1");
    embed.searchParams.set("rel", "0");
    embed.searchParams.set("modestbranding", "1");
    return embed.toString();
  } catch {
    return null;
  }
}

export function MediaGalleryStrip({ images = [], trailers = [] }: MediaGalleryStripProps) {
  const [open, setOpen] = useState(false);
  const [activeTrailer, setActiveTrailer] = useState<TrailerItem | null>(null);
  const [activeImage, setActiveImage] = useState<GalleryImage | null>(null);

  const trailerItems = useMemo(() => trailers.filter((t) => Boolean(youtubeEmbedUrl(t.url))), [trailers]);
  const hasImages = images.length > 0;
  const hasTrailers = trailerItems.length > 0;

  if (!hasImages && !hasTrailers) return null;

  const embedUrl = activeTrailer ? youtubeEmbedUrl(activeTrailer.url) : null;
  const showTrailerModal = open && Boolean(embedUrl) && !activeImage;
  const showImageModal = open && Boolean(activeImage) && !activeTrailer;

  return (
    <div className="media-section space-y-6 sm:space-y-8">
      {hasImages && (
        <div>
          <h2 className="media-section-title">Gallery</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {images.map((img, idx) => (
              <button
                key={`${img.type}-${idx}`}
                type="button"
                onClick={() => {
                  setActiveImage(img);
                  setActiveTrailer(null);
                  setOpen(true);
                }}
                className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/20 transition hover:border-white/30 ${img.type === "poster" ? "w-32 sm:w-36 aspect-[2/3]" : "w-56 sm:w-64 aspect-[16/9]"}`}
              >
                <Image src={img.url} alt={img.label} fill className="object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {hasTrailers && (
        <div>
          <h2 className="media-section-title">Trailers</h2>
          <div className="flex flex-wrap gap-3">
            {trailerItems.map((trailer) => (
              <button
                key={trailer.name}
                type="button"
                onClick={() => {
                  setActiveTrailer(trailer);
                  setActiveImage(null);
                  setOpen(true);
                }}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                <Play className="h-4 w-4" />
                <span className="truncate max-w-[200px]">{trailer.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={showTrailerModal}
        title={activeTrailer ? `${activeTrailer.name} - Trailer` : "Trailer"}
        onClose={() => {
          setOpen(false);
          setActiveTrailer(null);
        }}
      >
        <div className="w-full">
          <div className="relative w-full aspect-video overflow-hidden rounded-lg border border-border bg-black">
            {embedUrl && (
              <iframe
                className="absolute inset-0 h-full w-full"
                src={embedUrl}
                title={activeTrailer?.name ?? "Trailer"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={showImageModal}
        title={activeImage?.label ?? "Image"}
        onClose={() => {
          setOpen(false);
          setActiveImage(null);
        }}
      >
        <div className="w-full">
          <div className="relative w-full overflow-hidden rounded-lg border border-border bg-black">
            {activeImage && (
              <Image
                src={activeImage.url}
                alt={activeImage.label}
                width={activeImage.type === "poster" ? 500 : 900}
                height={activeImage.type === "poster" ? 750 : 506}
                className="h-auto w-full object-contain"
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
