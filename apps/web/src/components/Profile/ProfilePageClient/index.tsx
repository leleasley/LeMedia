"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRightCircle } from "lucide-react";
import useSWR from "swr";
import { ProfileHeader } from "@/components/Profile/ProfileHeader";
import { ImageFader } from "@/components/Common/ImageFader";
import { ProgressCircle } from "@/components/Common/ProgressCircle";
import { RecentRequestsSlider } from "@/components/Dashboard/RecentRequestsSlider";

interface ProfilePageClientProps {
  user: {
    username: string;
    email?: string | null;
    avatarUrl?: string | null;
    jellyfinUserId?: string | null;
    createdAt?: string;
    lastSeenAt?: string;
    userId?: number;
  };
  mfaEnabled: boolean;
  isAdmin: boolean;
  assignedEndpoints: Array<{
    id: number;
    name: string;
    type: string;
  }>;
}

interface RequestStats {
  total: number;
  movies: number;
  series: number;
  pending: number;
  available: number;
  failed: number;
}

interface RequestQuotaStatus {
  limit: number;
  days: number;
  used: number;
  remaining: number | null;
  unlimited: boolean;
}

interface RecentRequest {
  id: string;
  tmdbId: number;
  title: string;
  year?: string;
  backdrop: string | null;
  poster: string | null;
  type: "movie" | "tv";
  status: string;
  username: string;
  avatarUrl?: string | null;
}

export function ProfilePageClient({
  user,
  mfaEnabled,
  isAdmin,
  assignedEndpoints,
}: ProfilePageClientProps) {
  // Fetch stats
  const { data: statsData } = useSWR<{ stats: RequestStats; quota?: { movie: RequestQuotaStatus; series: RequestQuotaStatus } }>("/api/v1/profile/stats");
  const stats = statsData?.stats || null;
  
  // Fetch recent requests using SWR (like dashboard does)
  const { data: requestsData, isLoading } = useSWR<{ items: RecentRequest[] }>(
    "/api/v1/requests/recent?take=10",
    {
      revalidateOnFocus: false,
    }
  );
  
  const requests = useMemo(() => requestsData?.items || [], [requestsData]);
  
  const backgroundImages = useMemo(
    () =>
      requests
        .filter((r) => r.backdrop)
        .map((r) => r.backdrop as string)
        .slice(0, 6),
    [requests]
  );

  const movieQuotaData = statsData?.quota?.movie;
  const seriesQuotaData = statsData?.quota?.series;

  const movieQuota = {
    remaining: movieQuotaData?.remaining ?? 0,
    limit: movieQuotaData?.limit ?? 0,
    restricted: Boolean(movieQuotaData && movieQuotaData.limit > 0 && (movieQuotaData.remaining ?? 0) <= 0),
  };

  const seriesQuota = {
    remaining: seriesQuotaData?.remaining ?? 0,
    limit: seriesQuotaData?.limit ?? 0,
    restricted: Boolean(seriesQuotaData && seriesQuotaData.limit > 0 && (seriesQuotaData.remaining ?? 0) <= 0),
  };

  return (
    <>
      {/* Background Image Fader */}
      {backgroundImages.length > 0 && (
        <div className="absolute left-0 right-0 -top-16 z-0 h-[65vh] max-h-[720px] min-h-[480px]">
          <ImageFader
            backgroundImages={backgroundImages}
            isDarker
            className="absolute inset-0 mask-image-gradient-b"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1120] via-[#0b1120]/60 to-transparent" />
        </div>
      )}

      {/* Profile Header */}
      <ProfileHeader user={user} isAdmin={isAdmin} />

      {/* Request Stats Cards */}
      {stats && (
        <div className="relative z-0">
          <dl className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Total Requests */}
            <div className="overflow-hidden rounded-lg bg-gray-800/50 backdrop-blur-sm px-4 py-5 shadow ring-1 ring-gray-700 sm:p-6">
              <dt className="truncate text-sm font-bold text-gray-300">
                Total Requests
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-white">
                <Link
                  href="/requests"
                  className="hover:text-purple-300 transition-colors"
                >
                  {stats.total}
                </Link>
              </dd>
            </div>

            {/* Movie Requests */}
            <div
              className={`overflow-hidden rounded-lg bg-gray-800/50 backdrop-blur-sm px-4 py-5 shadow ring-1 ${
                movieQuota.restricted
                  ? "bg-gradient-to-t from-red-900/30 to-transparent ring-red-500"
                  : "ring-gray-700"
              } sm:p-6`}
            >
              <dt
                className={`truncate text-sm font-bold ${
                  movieQuota.restricted ? "text-red-400" : "text-gray-300"
                }`}
              >
                Movie Requests
              </dt>
              <dd
                className={`mt-1 flex items-center text-sm ${
                  movieQuota.restricted ? "text-red-400" : "text-white"
                }`}
              >
                {movieQuota.limit ? (
                  <>
                    <ProgressCircle
                      progress={Math.round(
                        (movieQuota.remaining / movieQuota.limit) * 100
                      )}
                      useHeatLevel
                      className="mr-2 h-8 w-8"
                    />
                    <div>
                      <span className="text-3xl font-semibold">
                        {movieQuota.remaining} of {movieQuota.limit}
                      </span>
                      <span className="ml-1 text-sm">remaining</span>
                    </div>
                  </>
                ) : (
                  <span className="text-3xl font-semibold">Unlimited</span>
                )}
              </dd>
            </div>

            {/* Series Requests */}
            <div
              className={`overflow-hidden rounded-lg bg-gray-800/50 backdrop-blur-sm px-4 py-5 shadow ring-1 ${
                seriesQuota.restricted
                  ? "bg-gradient-to-t from-red-900/30 to-transparent ring-red-500"
                  : "ring-gray-700"
              } sm:p-6`}
            >
              <dt
                className={`truncate text-sm font-bold ${
                  seriesQuota.restricted ? "text-red-400" : "text-gray-300"
                }`}
              >
                Series Requests
              </dt>
              <dd
                className={`mt-1 flex items-center text-sm ${
                  seriesQuota.restricted ? "text-red-400" : "text-white"
                }`}
              >
                {seriesQuota.limit ? (
                  <>
                    <ProgressCircle
                      progress={Math.round(
                        (seriesQuota.remaining / seriesQuota.limit) * 100
                      )}
                      useHeatLevel
                      className="mr-2 h-8 w-8"
                    />
                    <div>
                      <span className="text-3xl font-semibold">
                        {seriesQuota.remaining} of {seriesQuota.limit}
                      </span>
                      <span className="ml-1 text-sm">remaining</span>
                    </div>
                  </>
                ) : (
                  <span className="text-3xl font-semibold">Unlimited</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Recent Requests Slider */}
      {!isLoading && requests.length > 0 && (
        <div className="relative z-0 mt-8">
          <RecentRequestsSlider items={requests} />
        </div>
      )}

      {isLoading && (
        <div className="relative z-0 mt-8">
          <RecentRequestsSlider items={[]} isLoading={true} />
        </div>
      )}

      {!isLoading && requests.length === 0 && (
        <div className="relative z-0 mt-8 text-center text-gray-400 py-12">
          <p className="text-lg">No requests yet. Start requesting your favorite movies and shows!</p>
        </div>
      )}
    </>
  );
}
