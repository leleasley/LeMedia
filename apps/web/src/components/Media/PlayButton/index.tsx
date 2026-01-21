"use client";

import { useMemo, useState } from "react";
import ButtonWithDropdown from "@/components/Common/ButtonWithDropdown";
import { Modal } from "@/components/Common/Modal";

export interface PlayButtonLink {
  text: string;
  url: string;
  svg: React.ReactNode;
}

interface PlayButtonProps {
  links: PlayButtonLink[];
}

function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\/+/, "").split("/")[0];
      return id || null;
    }
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) return parts[1];
      if (parts[0] === "shorts" && parts[1]) return parts[1];
    }
  } catch {
    // ignore
  }
  return null;
}

export function PlayButton({ links }: PlayButtonProps) {
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const hasLinks = Array.isArray(links) && links.length > 0;

  const trailerEmbedUrl = useMemo(() => {
    if (!trailerUrl) return null;
    const id = parseYouTubeId(trailerUrl);
    if (!id) return null;
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  }, [trailerUrl]);

  if (!hasLinks) {
    return null;
  }

  const handleClick = (link: PlayButtonLink, event?: React.MouseEvent) => {
    const youtubeId = parseYouTubeId(link.url);
    if (youtubeId) {
      event?.preventDefault();
      setTrailerUrl(link.url);
      setTrailerOpen(true);
      return;
    }
    // Prevent default to avoid opening the link twice (once from href, once from window.open)
    event?.preventDefault();
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Modal open={trailerOpen} title="Trailer" onClose={() => setTrailerOpen(false)}>
        {trailerEmbedUrl ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              src={trailerEmbedUrl}
              title="Trailer"
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="text-sm text-gray-300">Unable to load trailer.</div>
        )}
      </Modal>

      <ButtonWithDropdown
        as="a"
        buttonType="ghost"
        text={
          <>
            {links[0].svg}
            <span>{links[0].text}</span>
          </>
        }
        href={links[0].url}
        target="_blank"
        className="z-20"
        onClick={(event) => handleClick(links[0], event)}
      >
        {links.length > 1
          ? links.slice(1).map((link, i) => (
              <ButtonWithDropdown.Item
                key={`play-button-dropdown-item-${i}`}
                buttonType="ghost"
                href={link.url}
                target="_blank"
                onClick={(event) => {
                  event.preventDefault();
                  handleClick(link, event);
                }}
              >
                {link.svg}
                <span>{link.text}</span>
              </ButtonWithDropdown.Item>
            ))
          : null}
      </ButtonWithDropdown>
    </>
  );
}
