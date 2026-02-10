"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRightCircle, ShieldCheck, Lock, Film, Tv, CheckCircle2, XCircle } from "lucide-react";
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
    {
      label: "Jellyfin",
      value: profileUser.jellyfinUsername ?? (profileUser.jellyfinUserId ? "Linked" : null),
      icon: "/images/jellyfin.svg",
      color: "purple",
      borderClass: "border-purple-500/20 hover:border-purple-500/40",
      bgClass: "from-purple-950/40 via-slate-900/60 to-slate-900/40",
      iconBgClass: "from-purple-500 to-purple-600",
      glowClass: "from-purple-500/5",
    },
    {
      label: "Trakt",
      value: profileUser.traktUsername ?? null,
      icon: "/images/trakt.svg",
      color: "red",
      borderClass: "border-red-500/20 hover:border-red-500/40",
      bgClass: "from-red-950/40 via-slate-900/60 to-slate-900/40",
      iconBgClass: "from-red-500 to-red-600",
      glowClass: "from-red-500/5",
    },
    {
      label: "Discord",
      value: profileUser.discordUserId ?? null,
      icon: "/images/discord.svg",
      color: "indigo",
      borderClass: "border-indigo-500/20 hover:border-indigo-500/40",
      bgClass: "from-indigo-950/40 via-slate-900/60 to-slate-900/40",
      iconBgClass: "from-indigo-500 to-indigo-600",
      glowClass: "from-indigo-500/5",
    },
    {
      label: "Letterboxd",
      value: profileUser.letterboxdUsername ?? null,
      icon: "/images/letterboxd.svg",
      color: "emerald",
      borderClass: "border-emerald-500/20 hover:border-emerald-500/40",
      bgClass: "from-emerald-950/40 via-slate-900/60 to-slate-900/40",
      iconBgClass: "from-emerald-400 to-emerald-600",
      glowClass: "from-emerald-500/5",
    },
  ];

  const badges = [
    isAdmin ? { label: "Admin", icon: "shield", color: "purple" } : null,
    mfaEnabled ? { label: "MFA Enabled", icon: "lock", color: "emerald" } : null,
    profileUser.jellyfinUserId ? { label: "Jellyfin Linked", icon: "jellyfin", color: "purple" } : null,
    profileUser.traktUsername ? { label: "Trakt Linked", icon: "trakt", color: "red" } : null,
  ].filter(Boolean) as Array<{ label: string; icon: string; color: string }>;

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
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 via-slate-900/60 to-slate-900/40 p-5 shadow-lg backdrop-blur-md lg:col-span-2 hover:border-blue-500/30 transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white">Profile Basics</h2>
              </div>
              <Link href="/settings/profile/general" className="text-xs text-gray-400 hover:text-white transition-colors">
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
                  className="mt-2 w-full rounded-xl border border-blue-500/20 bg-blue-950/20 px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-gray-400">Username</label>
                <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-300">
                  @{profileUser.username}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={saveDisplayName}
                disabled={displayNameSaving}
                className="rounded-xl bg-blue-600/80 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60"
              >
                {displayNameSaving ? "Saving..." : "Save Display Name"}
              </button>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 via-slate-900/60 to-slate-900/40 p-5 shadow-lg backdrop-blur-md hover:border-amber-500/30 transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="10" r="3" />
                  <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Avatar</h2>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Uploading an avatar updates your Jellyfin profile too.
            </p>
            {!profileUser.jellyfinUserId && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <Image src="/images/jellyfin.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                Link Jellyfin to enable avatar uploads.
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
              disabled={!profileUser.jellyfinUserId}
              className="w-full text-xs text-gray-300 file:mr-4 file:rounded-xl file:border-0 file:bg-amber-600/80 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-amber-600 file:transition-colors file:cursor-pointer disabled:opacity-60"
            />
            <button
              type="button"
              onClick={uploadAvatar}
              disabled={!avatarFile || avatarUploading || !profileUser.jellyfinUserId}
              className="mt-4 w-full rounded-xl bg-amber-600/80 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
            >
              {avatarUploading ? "Uploading..." : "Upload Avatar"}
            </button>
          </div>
        </div>
      </div>

      {/* Linked Accounts */}
      <div className="relative z-0 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Linked Accounts</h2>
          <Link href="/settings/profile/linked" className="text-xs text-gray-400 hover:text-white transition-colors">
            Manage links
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {linkedAccounts.map((account) => {
            const isLinked = Boolean(account.value);
            return (
              <div
                key={account.label}
                className={`relative overflow-hidden rounded-2xl border ${account.borderClass} bg-gradient-to-br ${account.bgClass} p-4 backdrop-blur-md transition-all`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${account.glowClass} to-transparent pointer-events-none`} />
                <div className="relative flex items-center gap-3">
                  <div className={`h-11 w-11 flex-shrink-0 rounded-xl bg-gradient-to-br ${account.iconBgClass} flex items-center justify-center shadow-lg`}>
                    <Image
                      src={account.icon}
                      alt={account.label}
                      width={24}
                      height={24}
                      className="h-6 w-6"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{account.label}</h3>
                      {isLinked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-300 border border-green-500/30">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-white/10">
                          <XCircle className="h-3 w-3" />
                          Not linked
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-300 truncate">
                      {account.value
                        ? (account.label === "Discord" ? `ID: ${account.value}` : `@${account.value}`)
                        : "Connect to get started"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Profile Badges */}
      <div className="relative z-0 mt-6">
        <h2 className="text-lg font-semibold text-white mb-4">Profile Badges</h2>
        <div className="flex flex-wrap gap-2">
          {badges.length === 0 && (
            <span className="text-sm text-gray-400">No badges yet</span>
          )}
          {badges.map((badge) => {
            const colorMap: Record<string, string> = {
              purple: "border-purple-500/30 bg-purple-500/10 text-purple-200",
              emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
              red: "border-red-500/30 bg-red-500/10 text-red-200",
              indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
            };
            const cls = colorMap[badge.color] || "border-white/10 bg-white/5 text-gray-200";
            return (
              <span key={badge.label} className={`inline-flex items-center gap-1.5 rounded-full border ${cls} px-3 py-1.5 text-xs font-semibold`}>
                {badge.icon === "shield" && <ShieldCheck className="h-3.5 w-3.5" />}
                {badge.icon === "lock" && <Lock className="h-3.5 w-3.5" />}
                {badge.icon === "jellyfin" && (
                  <Image src="/images/jellyfin.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                )}
                {badge.icon === "trakt" && (
                  <Image src="/images/trakt.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                )}
                {badge.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Request Stats Cards */}
      {stats && (
        <div className="relative z-0 mt-6">
          <h2 className="text-lg font-semibold text-white mb-4">Request Stats</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Total Requests */}
            <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-900/40 p-5 backdrop-blur-md hover:border-purple-500/40 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <ArrowRightCircle className="h-5 w-5 text-white" />
                  </div>
                  <dt className="text-sm font-bold text-gray-300">Total Requests</dt>
                </div>
                <dd className="text-3xl font-bold text-white">
                  <Link href="/requests" className="hover:text-purple-300 transition-colors">
                    {stats.total}
                  </Link>
                </dd>
              </div>
            </div>

            {/* Movie Requests */}
            <div className={`relative overflow-hidden rounded-2xl border ${movieQuota.restricted ? "border-red-500/40" : "border-indigo-500/20 hover:border-indigo-500/40"} bg-gradient-to-br ${movieQuota.restricted ? "from-red-950/40" : "from-indigo-950/40"} via-slate-900/60 to-slate-900/40 p-5 backdrop-blur-md transition-all`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${movieQuota.restricted ? "from-red-500/5" : "from-indigo-500/5"} to-transparent pointer-events-none`} />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${movieQuota.restricted ? "from-red-500 to-red-600" : "from-indigo-500 to-indigo-600"} flex items-center justify-center shadow-lg`}>
                    <Film className="h-5 w-5 text-white" />
                  </div>
                  <dt className={`text-sm font-bold ${movieQuota.restricted ? "text-red-400" : "text-gray-300"}`}>
                    Movie Quota
                  </dt>
                </div>
                <dd className={`flex items-center ${movieQuota.restricted ? "text-red-400" : "text-white"}`}>
                  {movieQuota.limit ? (
                    <>
                      <ProgressCircle
                        progress={Math.round((movieQuota.remaining / movieQuota.limit) * 100)}
                        useHeatLevel
                        className="mr-3 h-9 w-9"
                      />
                      <div>
                        <span className="text-2xl font-bold">{movieQuota.remaining}</span>
                        <span className="text-sm text-gray-400 ml-1">/ {movieQuota.limit} remaining</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-emerald-400">Unlimited</span>
                  )}
                </dd>
              </div>
            </div>

            {/* Series Requests */}
            <div className={`relative overflow-hidden rounded-2xl border ${seriesQuota.restricted ? "border-red-500/40" : "border-teal-500/20 hover:border-teal-500/40"} bg-gradient-to-br ${seriesQuota.restricted ? "from-red-950/40" : "from-teal-950/40"} via-slate-900/60 to-slate-900/40 p-5 backdrop-blur-md transition-all`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${seriesQuota.restricted ? "from-red-500/5" : "from-teal-500/5"} to-transparent pointer-events-none`} />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${seriesQuota.restricted ? "from-red-500 to-red-600" : "from-teal-500 to-teal-600"} flex items-center justify-center shadow-lg`}>
                    <Tv className="h-5 w-5 text-white" />
                  </div>
                  <dt className={`text-sm font-bold ${seriesQuota.restricted ? "text-red-400" : "text-gray-300"}`}>
                    Series Quota
                  </dt>
                </div>
                <dd className={`flex items-center ${seriesQuota.restricted ? "text-red-400" : "text-white"}`}>
                  {seriesQuota.limit ? (
                    <>
                      <ProgressCircle
                        progress={Math.round((seriesQuota.remaining / seriesQuota.limit) * 100)}
                        useHeatLevel
                        className="mr-3 h-9 w-9"
                      />
                      <div>
                        <span className="text-2xl font-bold">{seriesQuota.remaining}</span>
                        <span className="text-sm text-gray-400 ml-1">/ {seriesQuota.limit} remaining</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-emerald-400">Unlimited</span>
                  )}
                </dd>
              </div>
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
