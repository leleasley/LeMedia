"use client";

import { useState } from "react";
import { ReportIssueModal } from "@/components/Requests/ReportIssueModal";
import { ManageMediaModal } from "@/components/Requests/ManageMediaModal";
import { PlayButton, type PlayButtonLink } from "@/components/Media/PlayButton";
import Button from "@/components/Common/Button";
import { CogIcon, ExclamationTriangleIcon, FilmIcon, PlayIcon } from "@heroicons/react/24/outline";

export function MediaActionMenu(props: {
  title: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  tvdbId?: number | null;
  playUrl?: string | null;
  trailerUrl?: string | null;
  backdropUrl?: string | null;
  isAdmin: boolean;
  showReport: boolean;
  manageItemId?: number | null;
  manageSlug?: string | null;
  manageBaseUrl?: string | null;
  requestStatus?: string | null;
  prowlarrEnabled?: boolean;
}) {
  const {
    title,
    mediaType,
    tmdbId,
    tvdbId,
    playUrl,
    trailerUrl,
    backdropUrl,
    isAdmin,
    showReport,
    manageItemId,
    manageSlug,
    manageBaseUrl,
    requestStatus,
    prowlarrEnabled = false
  } = props;
  const [reportOpen, setReportOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const canManage =
    isAdmin && (Number.isFinite(Number(manageItemId ?? NaN)) || Boolean(requestStatus));

  const links: PlayButtonLink[] = [];
  if (playUrl) {
    links.push({
      text: "Play on Jellyfin",
      url: playUrl,
      svg: <PlayIcon />,
    });
  }
  if (trailerUrl) {
    links.push({
      text: "Watch Trailer",
      url: trailerUrl,
      svg: <FilmIcon />,
    });
  }

  return (
    <>
      <PlayButton links={links} />

      {showReport ? (
        <Button
          buttonType="warning"
          onClick={() => setReportOpen(true)}
          aria-label="Report an issue"
          className="ml-2 first:ml-0"
        >
          <ExclamationTriangleIcon />
        </Button>
      ) : null}

      {canManage ? (
        <Button
          buttonType="ghost"
          onClick={() => setManageOpen(true)}
          aria-label="Manage media"
          className="ml-2 first:ml-0"
        >
          <CogIcon className="!mr-0" />
        </Button>
      ) : null}

      <ReportIssueModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={title}
        mediaType={mediaType}
        tmdbId={tmdbId}
        backdropUrl={backdropUrl ?? null}
      />

      <ManageMediaModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title={title}
        mediaType={mediaType}
        tmdbId={tmdbId}
        tvdbId={tvdbId ?? undefined}
        backdropUrl={backdropUrl ?? null}
        serviceItemId={manageItemId ?? null}
        serviceSlug={manageSlug ?? null}
        serviceBaseUrl={manageBaseUrl ?? null}
        prowlarrEnabled={prowlarrEnabled}
      />
    </>
  );
}
