"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Users, Heart, MessageCircle, Bookmark, Calendar, Film, Tv,
  Star, Lock, UserPlus, UserMinus, Shield, MoreHorizontal, Flag,
  Ban, Globe, Eye, EyeOff, ListChecks, TrendingUp, Sparkles,
  ChevronRight, Clock, Award, Percent
} from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { Modal } from "@/components/Common/Modal";
import { formatDistanceToNow } from "date-fns";
import { getAvatarSrc, shouldBypassNextImage, getAvatarAlt } from "@/lib/avatar";

interface Profile {
  id: number;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  jellyfinUserId: string | null;
  bannerUrl: string | null;
  profileVisibility: string;
  showActivity: boolean;
  showStats: boolean;
  showLists: boolean;
  createdAt: string;
}

interface Stats {
  friendCount: number;
  listCount: number;
  reviewCount: number;
  watchlistCount: number;
  favoriteCount: number;
}

interface ListItem {
  id: number;
  name: string;
  description: string | null;
  visibility: string;
  itemCount: number;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  pinned: boolean;
  coverTmdbId: number | null;
  coverMediaType: string | null;
  customCoverImagePath: string | null;
  ownerUsername: string;
  createdAt: string;
  updatedAt: string;
  mood: string | null;
  occasion: string | null;
  shareId: string;
}

interface MutualInsight {
  overlapPercentage: number;
  sharedMediaCount: number;
  sharedListCount: number;
  sharedGenres: string[];
}

interface ProfileData {
  profile: Profile;
  stats: Stats | null;
  lists: ListItem[];
  friendStatus: string;
  mutualInsights: MutualInsight | null;
  isPrivate?: boolean;
  isFriendsOnly?: boolean;
}

export function PublicProfileClient({
  username,
  imageProxyEnabled,
}: {
  username: string;
  imageProxyEnabled: boolean;
}) {
  const toast = useToast();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [listTab, setListTab] = useState<"pinned" | "recent" | "popular">("pinned");

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/social/users/${encodeURIComponent(username)}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) {
          setData(null);
          return;
        }
        throw new Error("Failed to load profile");
      }
      const d = await res.json();
      setData(d);
    } catch {
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [toast, username]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleFriendAction = async (action: string, targetUserId?: number, requestId?: number) => {
    try {
      setActionLoading(true);
      const res = await csrfFetch("/api/v1/social/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetUserId, requestId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Action failed");
      }
      toast.success(
        action === "send_request" ? "Friend request sent!" :
        action === "accept" ? "Friend request accepted!" :
        action === "remove" ? "Friend removed" : "Done"
      );
      fetchProfile();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!data?.profile) return;
    try {
      await csrfFetch("/api/v1/social/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block", targetUserId: data.profile.id }),
      });
      toast.success("User blocked");
      setShowMenu(false);
      fetchProfile();
    } catch {
      toast.error("Failed to block user");
    }
  };

  const handleReport = async (reason: string, description: string) => {
    if (!data?.profile) return;
    try {
      await csrfFetch("/api/v1/social/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedUserId: data.profile.id,
          reason,
          description,
        }),
      });
      toast.success("Report submitted. Thank you.");
      setShowReportModal(false);
    } catch {
      toast.error("Failed to submit report");
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
        <div className="animate-pulse">
          <div className="h-48 bg-white/5 rounded-2xl mb-6" />
          <div className="flex items-center gap-4 mb-8">
            <div className="w-24 h-24 rounded-full bg-white/10" />
            <div className="space-y-2">
              <div className="h-6 w-48 bg-white/10 rounded" />
              <div className="h-4 w-32 bg-white/5 rounded" />
            </div>
          </div>
          <div className="h-32 bg-white/5 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data || !data.profile) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-24 text-center">
        <div className="w-20 h-20 rounded-full bg-white/5 mx-auto mb-6 flex items-center justify-center">
          <Users className="w-10 h-10 text-gray-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">User Not Found</h1>
        <p className="text-gray-400">The user &ldquo;{username}&rdquo; doesn&apos;t exist or has been banned.</p>
        <Link href="/social" className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
          Explore Users
        </Link>
      </div>
    );
  }

  const { profile, stats, lists, friendStatus, mutualInsights, isPrivate, isFriendsOnly } = data;

  // Private / Friends-only profile gates
  if (isPrivate) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
        <PrivateProfileBanner profile={profile} friendStatus={friendStatus} onFriendAction={handleFriendAction} actionLoading={actionLoading} />
      </div>
    );
  }

  if (isFriendsOnly) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
        <FriendsOnlyProfileBanner profile={profile} friendStatus={friendStatus} onFriendAction={handleFriendAction} actionLoading={actionLoading} />
      </div>
    );
  }

  const avatarSrc = getAvatarSrc(profile);
  const avatarBypass = shouldBypassNextImage(avatarSrc);

  const pinnedLists = lists?.filter((l) => l.pinned) || [];
  const recentLists = [...(lists || [])].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const popularLists = [...(lists || [])].sort((a, b) => b.likeCount - a.likeCount);

  const displayLists = listTab === "pinned" ? (pinnedLists.length > 0 ? pinnedLists : recentLists) :
    listTab === "recent" ? recentLists : popularLists;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Banner */}
      <div className="relative h-48 sm:h-64 overflow-hidden">
        {profile.bannerUrl ? (
          <Image
            src={profile.bannerUrl}
            alt="Profile banner"
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-purple-900/30 to-pink-900/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1120] via-[#0b1120]/50 to-transparent" />
      </div>

      {/* Profile Header */}
      <div className="relative px-4 sm:px-8 -mt-16 sm:-mt-20 pb-6 border-b border-white/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-6">
          {/* Avatar */}
          <div className="relative">
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl ring-4 ring-[#0b1120] overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 flex-shrink-0 shadow-2xl relative">
              {avatarBypass ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt={getAvatarAlt(profile)} className="object-cover w-full h-full" />
              ) : (
                <Image src={avatarSrc} alt={getAvatarAlt(profile)} fill className="object-cover" />
              )}
            </div>
            {/* Online indicator (based on last seen) */}
            {profile.createdAt && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 ring-2 ring-[#0b1120]" />
            )}
          </div>

          {/* Name & Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
                {profile.displayName || profile.username}
              </h1>
              {profile.profileVisibility === "friends" && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium flex items-center gap-1">
                  <Users className="w-3 h-3" /> Friends Only
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm mt-0.5">@{profile.username}</p>
            {profile.bio && (
              <p className="text-gray-300 mt-3 text-sm leading-relaxed max-w-2xl">{profile.bio}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Joined {formatDistanceToNow(new Date(profile.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0 sm:self-center">
            <FriendButton
              friendStatus={friendStatus}
              profileId={profile.id}
              onAction={handleFriendAction}
              loading={actionLoading}
            />

            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-gray-400 hover:text-white transition-all"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-48 bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                    <button
                      onClick={() => { setShowReportModal(true); setShowMenu(false); }}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Flag className="w-4 h-4" /> Report User
                    </button>
                    <button
                      onClick={handleBlock}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    >
                      <Ban className="w-4 h-4" /> Block User
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && profile.showStats && (
        <div className="px-4 sm:px-8 py-5 border-b border-white/5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard icon={<Users className="w-5 h-5" />} label="Friends" value={stats.friendCount} color="indigo" />
            <StatCard icon={<ListChecks className="w-5 h-5" />} label="Lists" value={stats.listCount} color="purple" />
            <StatCard icon={<Star className="w-5 h-5" />} label="Reviews" value={stats.reviewCount} color="amber" />
            <StatCard icon={<Film className="w-5 h-5" />} label="Watchlist" value={stats.watchlistCount} color="blue" />
            <StatCard icon={<Heart className="w-5 h-5" />} label="Favorites" value={stats.favoriteCount} color="pink" />
          </div>
        </div>
      )}

      {/* Mutual Taste Insights */}
      {mutualInsights && (mutualInsights.overlapPercentage > 0 || mutualInsights.sharedGenres.length > 0) && (
        <div className="px-4 sm:px-8 py-5 border-b border-white/5">
          <div className="bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-semibold text-white">Taste Match</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="relative w-20 h-20 mx-auto mb-2">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke="url(#overlapGradient)" strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(mutualInsights.overlapPercentage / 100) * 213.6} 213.6`}
                    />
                    <defs>
                      <linearGradient id="overlapGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#e879f9" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{mutualInsights.overlapPercentage}%</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400">Taste Overlap</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">{mutualInsights.sharedMediaCount}</div>
                <p className="text-xs text-gray-400">Shared Media</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Shared Genres</p>
                <div className="flex flex-wrap gap-1.5">
                  {mutualInsights.sharedGenres.slice(0, 5).map((genre) => (
                    <span key={genre} className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs">
                      {genre}
                    </span>
                  ))}
                  {mutualInsights.sharedGenres.length === 0 && (
                    <span className="text-xs text-gray-500">Rate more to discover shared genres</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lists Section */}
      {profile.showLists && lists && lists.length > 0 && (
        <div className="px-4 sm:px-8 py-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-indigo-400" />
              Lists
            </h2>
            <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/5">
              {(["pinned", "recent", "popular"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setListTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    listTab === tab
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab === "pinned" ? "Pinned" : tab === "recent" ? "Recent" : "Popular"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayLists.slice(0, 9).map((list) => (
              <ListCard key={list.id} list={list} imageProxyEnabled={imageProxyEnabled} />
            ))}
          </div>

          {lists.length > 9 && (
            <div className="text-center mt-6">
              <Link
                href={`/u/${username}/lists`}
                className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View all {lists.length} lists <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Empty State for Lists */}
      {profile.showLists && (!lists || lists.length === 0) && (
        <div className="px-4 sm:px-8 py-12 text-center">
          <ListChecks className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No public lists yet</p>
        </div>
      )}

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReport}
      />
    </div>
  );
}

// ============================================================
// Sub-Components
// ============================================================

function FriendButton({
  friendStatus,
  profileId,
  onAction,
  loading,
}: {
  friendStatus: string;
  profileId: number;
  onAction: (action: string, targetUserId?: number) => void;
  loading: boolean;
}) {
  if (friendStatus === "friends") {
    return (
      <button
        onClick={() => onAction("remove", profileId)}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-gray-300 hover:text-red-400 text-sm font-medium transition-all group"
      >
        <UserMinus className="w-4 h-4" />
        <span className="group-hover:hidden">Friends</span>
        <span className="hidden group-hover:inline">Unfriend</span>
      </button>
    );
  }

  if (friendStatus === "pending_sent") {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium"
      >
        <Clock className="w-4 h-4" />
        Request Sent
      </button>
    );
  }

  if (friendStatus === "pending_received") {
    return (
      <button
        onClick={() => onAction("accept", profileId)}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all"
      >
        <UserPlus className="w-4 h-4" />
        Accept Request
      </button>
    );
  }

  if (friendStatus === "blocked") {
    return null;
  }

  return (
    <button
      onClick={() => onAction("send_request", profileId)}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all"
    >
      <UserPlus className="w-4 h-4" />
      Add Friend
    </button>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-500/10 text-indigo-400",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-500/10 text-purple-400",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-500/10 text-amber-400",
    blue: "from-blue-500/10 to-blue-500/5 border-blue-500/10 text-blue-400",
    pink: "from-pink-500/10 to-pink-500/5 border-pink-500/10 text-pink-400",
  };

  return (
    <div className={`rounded-xl bg-gradient-to-br ${colorMap[color]} border p-3.5 text-center`}>
      <div className="flex items-center justify-center gap-2 mb-1">
        {icon}
        <span className="text-xl font-bold text-white">{value.toLocaleString()}</span>
      </div>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function ListCard({ list, imageProxyEnabled }: { list: ListItem; imageProxyEnabled: boolean }) {
  const coverUrl = list.customCoverImagePath
    ? `/api/v1/lists/${list.id}/cover/image`
    : list.coverTmdbId && list.coverMediaType
    ? `https://image.tmdb.org/t/p/w500/${list.coverTmdbId}`
    : null;

  return (
    <Link
      href={`/lists/${list.id}`}
      className="group relative bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5"
    >
      {/* Cover */}
      <div className="relative h-36 bg-gradient-to-br from-indigo-900/20 via-purple-900/15 to-pink-900/10">
        {coverUrl && (
          <Image src={coverUrl} alt={list.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

        {/* Pinned badge */}
        {list.pinned && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-semibold backdrop-blur-sm">
            PINNED
          </div>
        )}

        {/* Mood/Occasion */}
        {(list.mood || list.occasion) && (
          <div className="absolute top-2 right-2 flex gap-1">
            {list.mood && (
              <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-white/70 text-[10px] backdrop-blur-sm">
                {list.mood}
              </span>
            )}
          </div>
        )}

        {/* Item count */}
        <div className="absolute bottom-2 left-3 text-xs text-white/70 font-medium">
          {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5">
        <h3 className="font-semibold text-white text-sm truncate group-hover:text-indigo-300 transition-colors">
          {list.name}
        </h3>
        {list.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{list.description}</p>
        )}

        {/* Social stats */}
        <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
          {list.likeCount > 0 && (
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3 text-pink-400" /> {list.likeCount}
            </span>
          )}
          {list.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3 text-blue-400" /> {list.commentCount}
            </span>
          )}
          {list.saveCount > 0 && (
            <span className="flex items-center gap-1">
              <Bookmark className="w-3 h-3 text-amber-400" /> {list.saveCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function PrivateProfileBanner({
  profile,
  friendStatus,
  onFriendAction,
  actionLoading,
}: {
  profile: Profile;
  friendStatus: string;
  onFriendAction: (action: string, targetUserId?: number) => void;
  actionLoading: boolean;
}) {
  return (
    <div className="text-center py-20">
      <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 mx-auto mb-6 flex items-center justify-center">
        <Lock className="w-10 h-10 text-gray-500" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-1">
        {profile.displayName || profile.username}
      </h1>
      <p className="text-gray-400 mb-2">@{profile.username}</p>
      <p className="text-gray-500 text-sm mb-6">This profile is private</p>
    </div>
  );
}

function FriendsOnlyProfileBanner({
  profile,
  friendStatus,
  onFriendAction,
  actionLoading,
}: {
  profile: Profile;
  friendStatus: string;
  onFriendAction: (action: string, targetUserId?: number) => void;
  actionLoading: boolean;
}) {
  const avatarSrc = getAvatarSrc(profile);
  const avatarBypass = shouldBypassNextImage(avatarSrc);

  return (
    <div className="text-center py-20">
      <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 mx-auto mb-6 ring-4 ring-[#0b1120] relative">
        {avatarBypass ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt={getAvatarAlt(profile)} className="object-cover w-full h-full" />
        ) : (
          <Image src={avatarSrc} alt={getAvatarAlt(profile)} fill className="object-cover" />
        )}
      </div>
      <h1 className="text-2xl font-bold text-white mb-1">
        {profile.displayName || profile.username}
      </h1>
      <p className="text-gray-400 mb-2">@{profile.username}</p>
      <div className="flex items-center justify-center gap-2 text-amber-400 text-sm mb-6">
        <Users className="w-4 h-4" />
        <span>Friends Only Profile</span>
      </div>
      <p className="text-gray-500 text-sm mb-6">Add {profile.displayName || profile.username} as a friend to see their full profile</p>
      <FriendButton
        friendStatus={friendStatus}
        profileId={profile.id}
        onAction={onFriendAction}
        loading={actionLoading}
      />
    </div>
  );
}

function ReportModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string, description: string) => void;
}) {
  const [reason, setReason] = useState("spam");
  const [description, setDescription] = useState("");

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Report User">
      <div className="space-y-4 p-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="inappropriate">Inappropriate Content</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide additional details..."
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(reason, description)}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
          >
            Submit Report
          </button>
        </div>
      </div>
    </Modal>
  );
}
