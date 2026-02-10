"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightCircle } from "lucide-react";
import useSWR from "swr";
import { ProfileHeader } from "@/components/Profile/ProfileHeader";
import { ImageFader } from "@/components/Common/ImageFader";
import { ProgressCircle } from "@/components/Common/ProgressCircle";
import { RecentRequestsSlider } from "@/components/Dashboard/RecentRequestsSlider";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { useRouter } from "next/navigation";

interface ProfilePageClientProps {
  user: {
    username: string;
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    avatarVersion?: number | null;
    jellyfinUserId?: string | null;
    jellyfinUsername?: string | null;
    traktUsername?: string | null;
    discordUserId?: string | null;
    letterboxdUsername?: string | null;
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
  displayName?: string | null;
  avatarUrl?: string | null;
}

export function ProfilePageClient({
  user,
  mfaEnabled,
  isAdmin,
  assignedEndpoints,
}: ProfilePageClientProps) {
  const [profileUser, setProfileUser] = useState(user);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const toast = useToast();
  const router = useRouter();

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

  const linkedAccounts = [
    { label: "Jellyfin", value: profileUser.jellyfinUsername ?? (profileUser.jellyfinUserId ? "Linked" : null) },
    { label: "Trakt", value: profileUser.traktUsername ?? null },
    { label: "Discord", value: profileUser.discordUserId ?? null },
    { label: "Letterboxd", value: profileUser.letterboxdUsername ?? null }
  ];

  const badges = [
    isAdmin ? "Admin" : null,
    mfaEnabled ? "MFA Enabled" : null,
    profileUser.jellyfinUserId ? "Jellyfin Linked" : null,
    profileUser.traktUsername ? "Trakt Linked" : null
  ].filter(Boolean) as string[];

  const saveDisplayName = async () => {
    if (displayNameSaving) return;
    const trimmed = displayName.trim();
    if (trimmed === (profileUser.displayName ?? "").trim()) {
      return;
    }
    setDisplayNameSaving(true);
    try {
      const res = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to update display name");
      }
      setProfileUser(prev => ({ ...prev, displayName: body?.user?.displayName ?? trimmed }));
      toast.success("Display name updated");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update display name");
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const uploadAvatar = async () => {
    if (!avatarFile || avatarUploading) return;
    if (avatarFile.size > 2 * 1024 * 1024) {
      toast.error("Avatar must be 2MB or less");
      return;
    }
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.set("avatar", avatarFile);
      const res = await csrfFetch("/api/v1/profile/avatar", {
        method: "POST",
        body: form
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to update avatar");
      }
      setProfileUser(prev => ({
        ...prev,
        avatarUrl: body.avatarUrl ?? prev.avatarUrl,
        avatarVersion: body.avatarVersion ?? prev.avatarVersion
      }));
      setAvatarFile(null);
      toast.success("Avatar updated");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update avatar");
    } finally {
      setAvatarUploading(false);
    }
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
      <ProfileHeader user={profileUser} isAdmin={isAdmin} />

      {/* Profile Basics */}
      <div className="relative z-0 mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-5 shadow-lg lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Profile Basics</h2>
            <Link href="/settings/profile/general" className="text-xs text-gray-400 hover:text-white">
              More options
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-400">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-400">Username</label>
              <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300">
                @{profileUser.username}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={saveDisplayName}
              disabled={displayNameSaving}
              className="rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-60"
            >
              {displayNameSaving ? "Saving..." : "Save Display Name"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-5 shadow-lg">
          <h2 className="text-lg font-semibold text-white mb-4">Avatar</h2>
          <p className="text-xs text-gray-400 mb-3">
            Uploading an avatar updates your Jellyfin profile too.
          </p>
          {!profileUser.jellyfinUserId && (
            <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Link Jellyfin to enable avatar uploads.
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            disabled={!profileUser.jellyfinUserId}
            className="w-full text-xs text-gray-300 file:mr-4 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-white/20 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={uploadAvatar}
            disabled={!avatarFile || avatarUploading || !profileUser.jellyfinUserId}
            className="mt-4 w-full rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-60"
          >
            {avatarUploading ? "Uploading..." : "Upload Avatar"}
          </button>
        </div>
      </div>

      {/* Linked Accounts & Badges */}
      <div className="relative z-0 mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-5 shadow-lg lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Linked Accounts</h2>
            <Link href="/settings/profile/linked" className="text-xs text-gray-400 hover:text-white">
              Manage links
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {linkedAccounts.map((account) => (
              <div key={account.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-gray-400">{account.label}</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {account.value ?? "Not linked"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-5 shadow-lg">
          <h2 className="text-lg font-semibold text-white mb-4">Profile Badges</h2>
          <div className="flex flex-wrap gap-2">
            {badges.length === 0 && (
              <span className="text-sm text-gray-400">No badges yet</span>
            )}
            {badges.map((badge) => (
              <span key={badge} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-200">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

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
