"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Users, UserPlus, UserMinus, UserCheck, Clock, Search,
  Check, X, MessageCircle, MoreHorizontal, Ban, Inbox
} from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { formatDistanceToNow } from "date-fns";
import { getAvatarSrc, shouldBypassNextImage, getAvatarAlt } from "@/lib/avatar";

interface Friend {
  userId: number;
  friendId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  jellyfinUserId: string | null;
  bio: string | null;
  lastSeenAt: string;
  friendSince: string;
}

interface FriendRequest {
  id: number;
  fromUserId: number;
  toUserId: number;
  fromUsername: string;
  fromDisplayName: string | null;
  fromAvatarUrl: string | null;
  fromJellyfinUserId: string | null;
  toUsername: string;
  toDisplayName: string | null;
  toAvatarUrl: string | null;
  toJellyfinUserId: string | null;
  message: string | null;
  createdAt: string;
}

type Tab = "friends" | "requests" | "sent" | "blocked";

export function FriendsPageClient() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [blocked, setBlocked] = useState<{ blockedId: number; username: string; displayName: string | null; avatarUrl: string | null; jellyfinUserId: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchData();
  }, [tab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (tab === "friends") {
        const res = await fetch("/api/v1/social/friends", { credentials: "include" });
        const data = await res.json();
        setFriends(data.friends || []);
        setFriendCount(data.friendCount || 0);
        setPendingCount(data.pendingCount || 0);
      } else if (tab === "requests") {
        const res = await fetch("/api/v1/social/friends?view=pending", { credentials: "include" });
        const data = await res.json();
        setPendingRequests(data.requests || []);
      } else if (tab === "sent") {
        const res = await fetch("/api/v1/social/friends?view=sent", { credentials: "include" });
        const data = await res.json();
        setSentRequests(data.requests || []);
      } else if (tab === "blocked") {
        const res = await fetch("/api/v1/social/blocks", { credentials: "include" });
        const data = await res.json();
        setBlocked(data.blocked || []);
      }
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleFriendAction = async (action: string, opts: { targetUserId?: number; requestId?: number }) => {
    try {
      const res = await csrfFetch("/api/v1/social/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...opts }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      // Immediate UI update for cancel_request
      if (action === "cancel_request" && opts.targetUserId) {
        setSentRequests((prev) => prev.filter((req) => req.toUserId !== opts.targetUserId));
        toast.success("Friend request cancelled");
        return;
      }

      toast.success(
        action === "accept" ? "Friend request accepted!" :
        action === "decline" ? "Request declined" :
        action === "remove" ? "Friend removed" : "Done"
      );
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleUnblock = async (targetUserId: number) => {
    try {
      await csrfFetch("/api/v1/social/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unblock", targetUserId }),
      });
      toast.success("User unblocked");
      fetchData();
    } catch {
      toast.error("Failed to unblock user");
    }
  };

  const filteredFriends = searchQuery
    ? friends.filter((f) =>
        f.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.displayName && f.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : friends;

  const tabs = [
    { id: "friends" as Tab, label: "Friends", count: friendCount, icon: <Users className="w-4 h-4" /> },
    { id: "requests" as Tab, label: "Requests", count: pendingCount, icon: <Inbox className="w-4 h-4" /> },
    { id: "sent" as Tab, label: "Sent", icon: <Clock className="w-4 h-4" /> },
    { id: "blocked" as Tab, label: "Blocked", icon: <Ban className="w-4 h-4" /> },
  ];

  return (
    <div className="pb-12">
      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.id
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-md text-xs ${
                tab === t.id ? "bg-white/20" : "bg-white/10"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "friends" && (
        <div>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse h-20 bg-white/5 rounded-xl" />
              ))}
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm mb-4">
                {searchQuery ? "No friends match your search" : "You haven't added any friends yet"}
              </p>
              <Link href="/social/discover" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
                <UserPlus className="w-4 h-4" /> Discover People
              </Link>
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredFriends.map((friend) => (
                <FriendCard key={friend.friendId} friend={friend} onRemove={() => handleFriendAction("remove", { targetUserId: friend.friendId })} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "requests" && (
        <div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="animate-pulse h-20 bg-white/5 rounded-xl" />
              ))}
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No pending friend requests</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {pendingRequests.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  onAccept={() => handleFriendAction("accept", { requestId: req.id })}
                  onDecline={() => handleFriendAction("decline", { requestId: req.id })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "sent" && (
        <div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="animate-pulse h-20 bg-white/5 rounded-xl" />
              ))}
            </div>
          ) : sentRequests.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No pending sent requests</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {sentRequests.map((req) => (
                <div key={req.id} className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                  <UserAvatar
                    user={{ avatarUrl: req.toAvatarUrl, jellyfinUserId: req.toJellyfinUserId, displayName: req.toDisplayName, username: req.toUsername }}
                    name={req.toDisplayName || req.toUsername}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <Link href={`/u/${req.toUsername}`} className="font-medium text-white hover:text-indigo-300 transition-colors">
                      {req.toDisplayName || req.toUsername}
                    </Link>
                    <p className="text-xs text-gray-500">@{req.toUsername} &middot; Sent {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}</p>
                  </div>
                  <button
                    onClick={() => handleFriendAction("cancel_request", { targetUserId: req.toUserId })}
                    className="px-2 py-1 rounded-lg bg-red-600/20 border border-red-600/30 text-red-400 text-xs font-medium hover:bg-red-600/30 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "blocked" && (
        <div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="animate-pulse h-20 bg-white/5 rounded-xl" />
              ))}
            </div>
          ) : blocked.length === 0 ? (
            <div className="text-center py-16">
              <Ban className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No blocked users</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {blocked.map((user) => (
                <div key={user.blockedId} className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                  <UserAvatar user={user} name={user.displayName || user.username} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white">{user.displayName || user.username}</p>
                    <p className="text-xs text-gray-500">@{user.username} &middot; Blocked {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}</p>
                  </div>
                  <button
                    onClick={() => handleUnblock(user.blockedId)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors"
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sub-components

function UserAvatar({ src, name, size = "md", user }: { src?: string | null; name: string; size?: "sm" | "md" | "lg"; user?: { avatarUrl?: string | null; jellyfinUserId?: string | null; avatarVersion?: number | null; displayName?: string | null; username?: string | null } | null }) {
  const sizeMap = { sm: "w-8 h-8 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-lg" };
  const imgSrc = user ? getAvatarSrc(user) : (src || "");
  const bypass = shouldBypassNextImage(imgSrc);
  const alt = user ? getAvatarAlt(user) : name;
  return (
    <div className={`${sizeMap[size]} rounded-xl overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 flex-shrink-0`}>
      {bypass ? (
        <img src={imgSrc} alt={alt} className="object-cover w-full h-full" />
      ) : imgSrc && !imgSrc.startsWith("data:") ? (
        <Image src={imgSrc} alt={alt} width={64} height={64} className="object-cover w-full h-full" />
      ) : (
        <div className="flex items-center justify-center h-full font-bold text-white/80">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function FriendCard({ friend, onRemove }: { friend: Friend; onRemove: () => void }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="flex items-center gap-4 p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl transition-colors">
      <Link href={`/u/${friend.username}`}>
        <UserAvatar
          user={friend}
          name={friend.displayName || friend.username}
          size="md"
        />
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/u/${friend.username}`} className="font-medium text-white hover:text-indigo-300 transition-colors">
          {friend.displayName || friend.username}
        </Link>
        <p className="text-xs text-gray-500">@{friend.username}</p>
        {friend.bio && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{friend.bio}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-gray-500 hidden sm:block">
          Friends since {formatDistanceToNow(new Date(friend.friendSince), { addSuffix: true })}
        </span>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <Link
                  href={`/u/${friend.username}`}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-white/5"
                  onClick={() => setShowMenu(false)}
                >
                  <Users className="w-3.5 h-3.5" /> View Profile
                </Link>
                <button
                  onClick={() => { onRemove(); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                >
                  <UserMinus className="w-3.5 h-3.5" /> Remove Friend
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestCard({
  request,
  onAccept,
  onDecline,
}: {
  request: FriendRequest;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 bg-white/[0.02] border border-indigo-500/10 rounded-xl">
      <Link href={`/u/${request.fromUsername}`}>
        <UserAvatar user={{ avatarUrl: request.fromAvatarUrl, jellyfinUserId: request.fromJellyfinUserId, displayName: request.fromDisplayName, username: request.fromUsername }} name={request.fromDisplayName || request.fromUsername} size="md" />
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/u/${request.fromUsername}`} className="font-medium text-white hover:text-indigo-300 transition-colors">
          {request.fromDisplayName || request.fromUsername}
        </Link>
        <p className="text-xs text-gray-500">@{request.fromUsername} &middot; {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</p>
        {request.message && (
          <p className="text-xs text-gray-400 mt-1 italic">&ldquo;{request.message}&rdquo;</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onAccept}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Accept
        </button>
        <button
          onClick={onDecline}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Decline
        </button>
      </div>
    </div>
  );
}
