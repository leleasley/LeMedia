"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Common/Modal";
import { Play } from "lucide-react";

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

export function TrailerModalButton(props: { title: string; trailerUrl: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const embedUrl = useMemo(() => (props.trailerUrl ? youtubeEmbedUrl(props.trailerUrl) : null), [props.trailerUrl]);

  if (!embedUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-8 py-3.5 rounded-lg bg-white text-black font-bold hover:bg-gray-200 transition-all shadow-lg hover:shadow-white/20 active:scale-95"
      >
        <Play className="h-5 w-5 fill-current" />
        Play Trailer
      </button>
      <Modal open={open} title={`${props.title} — Trailer`} onClose={() => setOpen(false)}>
        <div className="w-full">
          <div className="relative w-full aspect-video overflow-hidden rounded-lg border border-border bg-black">
            <iframe
              className="absolute inset-0 h-full w-full"
              src={embedUrl}
              title={`${props.title} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
