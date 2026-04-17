"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRightCircle, ShieldCheck, Lock, Film, Tv, CheckCircle2, XCircle } from "lucide-react";
import useSWR from "swr";
import { ProfileHeader } from "@/components/Profile/ProfileHeader";
import { ProfileBackgroundOverride } from "@/components/Profile/ProfileBackgroundOverride";
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
    googleEmail?: string | null;
    githubLogin?: string | null;
    telegramUsername?: string | null;
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
    {
      label: "Google",
      value: profileUser.googleEmail ?? null,
      icon: "/google.svg",
      color: "blue",
      borderClass: "border-blue-500/20 hover:border-blue-500/40",
      bgClass: "from-blue-950/40 via-slate-900/60 to-slate-900/40",
      iconBgClass: "from-blue-500 to-blue-600",
      glowClass: "from-blue-500/5",
    },
    {
      label: "GitHub",
      value: profileUser.githubLogin ?? null,
      icon: "/github.svg",
      color: "gray",
      borderClass: "border-gray-500/20 hover:border-gray-500/40",
      bgClass: "from-gray-950/40 via-slate-900/60 to-slate-900/40",
      iconBgClass: "from-gray-600 to-gray-700",
      glowClass: "from-gray-500/5",
    },
    {
      label: "Telegram",
      value: profileUser.telegramUsername ?? null,
      icon: "/telegram.svg",
      color: "sky",
      borderClass: "border-sky-500/20 hover:border-sky-500/40",
      bgClass: "from-sky-950/40 via-slate-900/60 to-slate-900/40",
      iconBgClass: "from-sky-500 to-cyan-600",
      glowClass: "from-sky-500/5",
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
    <div className="profile-page-root">
      <ProfileBackgroundOverride />
      {/* Background Image Fader */}
      {backgroundImages.length > 0 && (
        <div className="profile-page-backdrop absolute -left-3 -right-3 z-0 h-[58vh] min-h-[420px] max-h-[620px] sm:h-[62vh] sm:min-h-[500px] sm:max-h-[700px] lg:-left-6 lg:-right-6 lg:h-[70vh] lg:max-h-[820px] lg:min-h-[560px]">
          <ImageFader
            backgroundImages={backgroundImages}
            isDarker
            className="absolute inset-0 mask-image-gradient-b"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1120] via-[#0b1120]/60 to-transparent" />
          <div className="profile-page-backdrop-fade absolute inset-x-0 bottom-0 h-32 sm:h-36" />
        </div>
      )}

      <div className="relative z-10 pt-28 sm:pt-36 lg:pt-44">
        <ProfileHeader user={profileUser} isAdmin={isAdmin} />

        <div className="mb-8 flex flex-wrap items-center gap-2 sm:gap-3">
          {badges.map((badge) => {
            const colorMap: Record<string, string> = {
              purple: "border-purple-500/30 bg-purple-500/12 text-purple-100",
              emerald: "border-emerald-500/30 bg-emerald-500/12 text-emerald-100",
              red: "border-red-500/30 bg-red-500/12 text-red-100",
              indigo: "border-indigo-500/30 bg-indigo-500/12 text-indigo-100",
            };
            const cls = colorMap[badge.color] || "border-white/10 bg-white/5 text-gray-200";
            return (
              <span key={badge.label} className={`inline-flex items-center gap-1.5 rounded-full border ${cls} px-3 py-1.5 text-xs font-semibold backdrop-blur-sm`}>
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
          {assignedEndpoints.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white/70 backdrop-blur-sm">
              {assignedEndpoints.length} service {assignedEndpoints.length === 1 ? "endpoint" : "endpoints"}
            </span>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(9,17,30,0.74),rgba(9,17,30,0.52))] px-5 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-6 sm:py-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.10),transparent_24%)]" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:gap-10">
            <section>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/70">Profile studio</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Keep your public identity sharp</h2>
                </div>
                <Link href="/settings/profile/general" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white">
                  More options
                </Link>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Display name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-blue-400/40 focus:bg-black/30"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Username</label>
                  <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/75">
                    @{profileUser.username}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/55">
                {profileUser.email ? <span>{profileUser.email}</span> : null}
                {profileUser.jellyfinUsername ? <span>Jellyfin: {profileUser.jellyfinUsername}</span> : null}
                {profileUser.traktUsername ? <span>Trakt: @{profileUser.traktUsername}</span> : null}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveDisplayName}
                  disabled={displayNameSaving}
                  className="inline-flex items-center justify-center rounded-full bg-blue-600/85 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                >
                  {displayNameSaving ? "Saving..." : "Save display name"}
                </button>
                <span className="text-xs text-white/45">A cleaner display name updates wherever your profile appears.</span>
              </div>
            </section>

            <section className="lg:border-l lg:border-white/8 lg:pl-10">
              <div className="flex items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/70">Avatar tools</p>
              </div>
              <h3 className="mt-2 text-xl font-semibold text-white">Refresh your look</h3>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Uploading an avatar updates your Jellyfin profile too, so your identity stays consistent across the app.
              </p>

              {!profileUser.jellyfinUserId && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100">
                  <Image src="/images/jellyfin.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                  Link Jellyfin to enable avatar uploads
                </div>
              )}

              <div className="mt-5 space-y-4">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                  disabled={!profileUser.jellyfinUserId}
                  className="w-full text-xs text-gray-300 file:mr-4 file:rounded-full file:border-0 file:bg-amber-600/85 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-amber-500 file:transition-colors file:cursor-pointer disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={uploadAvatar}
                  disabled={!avatarFile || avatarUploading || !profileUser.jellyfinUserId}
                  className="inline-flex w-full items-center justify-center rounded-full bg-amber-600/85 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-60"
                >
                  {avatarUploading ? "Uploading..." : "Upload avatar"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Linked Accounts */}
      <div className="relative z-10 mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Connected services</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Linked accounts</h2>
          </div>
          <Link href="/settings/profile/linked" className="text-xs text-gray-400 hover:text-white transition-colors">
            Manage links
          </Link>
        </div>
        <div className="overflow-hidden rounded-[2rem] border border-white/8 bg-black/18 backdrop-blur-xl">
          {linkedAccounts.map((account) => {
            const isLinked = Boolean(account.value);
            return (
              <div
                key={account.label}
                className="relative border-b border-white/6 px-4 py-4 last:border-b-0 sm:px-5"
              >
                <div className={`absolute inset-0 bg-gradient-to-r ${account.glowClass} via-transparent to-transparent pointer-events-none`} />
                <div className="relative flex items-center gap-3 sm:gap-4">
                  <div className={`h-11 w-11 flex-shrink-0 rounded-2xl bg-gradient-to-br ${account.iconBgClass} flex items-center justify-center shadow-lg`}>
                    <Image
                      src={account.icon}
                      alt={account.label}
                      width={24}
                      height={24}
                      className="h-6 w-6"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white sm:text-base">{account.label}</h3>
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
                    <p className="mt-1 text-sm text-gray-300 truncate">
                      {account.value
                        ? (account.label === "Discord"
                          ? `ID: ${account.value}`
                          : account.label === "Google"
                            ? account.value
                            : account.label === "Telegram"
                              ? String(account.value).startsWith("@") ? account.value : `@${account.value}`
                              : `@${account.value}`)
                        : "Connect to get started"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Request Stats */}
      {stats && (
        <div className="relative z-10 mt-10">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Numbers</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Request rhythm</h2>
          </div>
          <dl className="overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] backdrop-blur-xl sm:grid sm:grid-cols-3">
            <div className="border-b border-white/8 p-5 sm:border-b-0 sm:border-r">
              <dt className="flex items-center gap-3 text-sm font-semibold text-white/60">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300">
                  <ArrowRightCircle className="h-5 w-5" />
                </span>
                Total Requests
              </dt>
              <dd className="mt-4 text-4xl font-bold tracking-tight text-white">
                <Link href="/requests" className="transition-colors hover:text-purple-300">
                  {stats.total}
                </Link>
              </dd>
              <p className="mt-2 text-sm text-white/45">Everything you have queued, requested, or pushed through the app.</p>
            </div>

            <div className="border-b border-white/8 p-5 sm:border-b-0 sm:border-r">
              <dt className={`flex items-center gap-3 text-sm font-semibold ${movieQuota.restricted ? "text-red-300" : "text-white/60"}`}>
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${movieQuota.restricted ? "bg-red-500/15 text-red-300" : "bg-indigo-500/15 text-indigo-300"}`}>
                  <Film className="h-5 w-5" />
                </span>
                Movie Quota
              </dt>
              <dd className="mt-4 flex items-center gap-3 text-white">
                {movieQuota.limit ? (
                  <>
                    <ProgressCircle
                      progress={Math.round((movieQuota.remaining / movieQuota.limit) * 100)}
                      useHeatLevel
                      className="h-10 w-10"
                    />
                    <div>
                      <div className={`text-3xl font-bold tracking-tight ${movieQuota.restricted ? "text-red-300" : "text-white"}`}>{movieQuota.remaining}</div>
                      <div className="text-sm text-white/45">of {movieQuota.limit} remaining</div>
                    </div>
                  </>
                ) : (
                  <span className="text-3xl font-bold text-emerald-400">Unlimited</span>
                )}
              </dd>
            </div>

            <div className="p-5">
              <dt className={`flex items-center gap-3 text-sm font-semibold ${seriesQuota.restricted ? "text-red-300" : "text-white/60"}`}>
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${seriesQuota.restricted ? "bg-red-500/15 text-red-300" : "bg-teal-500/15 text-teal-300"}`}>
                  <Tv className="h-5 w-5" />
                </span>
                Series Quota
              </dt>
              <dd className="mt-4 flex items-center gap-3 text-white">
                {seriesQuota.limit ? (
                  <>
                    <ProgressCircle
                      progress={Math.round((seriesQuota.remaining / seriesQuota.limit) * 100)}
                      useHeatLevel
                      className="h-10 w-10"
                    />
                    <div>
                      <div className={`text-3xl font-bold tracking-tight ${seriesQuota.restricted ? "text-red-300" : "text-white"}`}>{seriesQuota.remaining}</div>
                      <div className="text-sm text-white/45">of {seriesQuota.limit} remaining</div>
                    </div>
                  </>
                ) : (
                  <span className="text-3xl font-bold text-emerald-400">Unlimited</span>
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
    </div>
  );
}
