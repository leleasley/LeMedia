"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CheckCircle, Eye } from "lucide-react";
import ButtonWithDropdown from "@/components/Common/ButtonWithDropdown";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { RequestMediaModal } from "@/components/Requests/RequestMediaModal";
import { DownloadProgressBar } from "@/components/Media/DownloadProgressBar";

type QualityProfile = { id: number; name: string };

type MovieInfo = {
  qualityProfiles: QualityProfile[];
  radarrMovie: any | null;
  radarrError: string | null;
  defaultQualityProfileId: number;
  requestsBlocked: boolean;
  isAdmin?: boolean;
  prowlarrEnabled?: boolean;
};

export function MovieRequestPanel({
  tmdbId,
  prefetched,
  loading,
  title,
  posterUrl,
  backdropUrl,
  year
}: {
  tmdbId: number;
  prefetched?: MovieInfo | null;
  loading?: boolean;
  title?: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  year?: string | number | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  const { data, error, mutate } = useSWR<MovieInfo>(
    prefetched ? null : `/api/v1/radarr/movie-info?tmdbId=${tmdbId}`,
    { fallbackData: prefetched ?? undefined }
  );
  const info = prefetched ?? data ?? null;

  if (error) {
    return (
      <div className="w-full rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
        ⚠️ Radarr Error: {error?.message ?? "Unable to load Radarr info"}
      </div>
    );
  }

  if (!info) {
    const placeholderText = loading ? "Loading..." : "Checking availability...";
    return (
      <div
        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400 opacity-0"
        aria-hidden="true"
      >
        {placeholderText}
      </div>
    );
  }

  if (info.radarrError) {
    return (
      <div className="w-full rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
        ⚠️ Radarr Error: {info.radarrError}
      </div>
    );
  }

  if (info.radarrMovie) {
    // Check if file is already available
    if (info.radarrMovie.hasFile) {
      return (
        <div className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold border bg-emerald-500/20 border-emerald-500/30 text-emerald-100">
          <CheckCircle className="h-5 w-5" />
          Available in Radarr
        </div>
      );
    }
    
    // Movie is monitored but not yet downloaded - show download progress
    return (
      <DownloadProgressBar
        type="movie"
        tmdbId={tmdbId}
        onComplete={() => {
          // Refresh the data when download completes
          mutate();
          router.refresh();
        }}
      />
    );
  }

  if (info.qualityProfiles.length === 0) {
    return (
      <div className="w-full rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm">
        ⚠️ Configure Radarr with a quality profile before requesting
      </div>
    );
  }

  return (
    <>
      <ButtonWithDropdown
        buttonSize="sm"
        text={
          <>
            <ArrowDownTrayIcon />
            <span>Request</span>
          </>
        }
        onClick={() => setModalOpen(true)}
      />
      
      {modalOpen && (
        <RequestMediaModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          tmdbId={tmdbId}
          mediaType="movie"
          qualityProfiles={info.qualityProfiles}
          defaultQualityProfileId={info.defaultQualityProfileId}
          requestsBlocked={info.requestsBlocked}
          title={title}
          year={year}
          posterUrl={posterUrl}
          backdropUrl={backdropUrl}
          isAdmin={Boolean(info.isAdmin)}
          prowlarrEnabled={Boolean(info.prowlarrEnabled)}
          serviceItemId={info.radarrMovie?.id ?? null}
        />
      )}
    </>
  );
}
