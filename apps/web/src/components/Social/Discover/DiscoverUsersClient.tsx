"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Search, Users, UserPlus, TrendingUp, Sparkles, Clock, Filter,
  ChevronDown, Check, X
} from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { getAvatarSrc, shouldBypassNextImage, getAvatarAlt } from "@/lib/avatar";

interface UserResult {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  jellyfinUserId: string | null;
  bio: string | null;
  friendStatus: "none" | "friends" | "pending_sent" | "pending_received";
  mutualFriends: number;
}

type DiscoverFilter = "trending" | "similar" | "new" | "";

export function DiscoverUsersClient() {
  const toast = useToast();
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<DiscoverFilter>("");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (filter) params.set("filter", filter);
      params.set("limit", "30");

      const res = await fetch(`/api/v1/social/users/search?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filter]);

  useEffect(() => {
    const timeout = setTimeout(fetchUsers, searchQuery ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchUsers]);

  const handleSendRequest = async (userId: number) => {
    try {
      setActionLoadingId(userId);
      const res = await csrfFetch("/api/v1/social/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_request", targetUserId: userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Friend request sent!");
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, friendStatus: "pending_sent" as const } : u))
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (userId: number) => {
    try {
      setActionLoadingId(userId);
      const res = await csrfFetch("/api/v1/social/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_request", targetUserId: userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Friend request cancelled");
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, friendStatus: "none" as const } : u))
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const filters: { id: DiscoverFilter; label: string; icon: React.ReactNode }[] = [
    { id: "", label: "All", icon: <Users className="w-3.5 h-3.5" /> },
    { id: "trending", label: "Trending", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: "similar", label: "Similar Taste", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "new", label: "New Users", icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="pb-12">
      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
        <input
          type="text"
          placeholder="Search by username or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-11 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Filters */}
      {!searchQuery && (
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                filter === f.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                  : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5"
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse h-36 bg-white/5 rounded-xl" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {searchQuery ? "No users found matching your search" : "No users to discover yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onSendRequest={() => handleSendRequest(user.id)}
              onCancelRequest={() => handleCancelRequest(user.id)}
              loading={actionLoadingId === user.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({
  user,
  onSendRequest,
  onCancelRequest,
  loading,
}: {
  user: UserResult;
  onSendRequest: () => void;
  onCancelRequest: () => void;
  loading: boolean;
}) {
  const avatarSrc = getAvatarSrc(user);
  const bypass = shouldBypassNextImage(avatarSrc);

  return (
    <div className="bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all">
      <div className="flex items-start gap-3">
        <Link href={`/u/${user.username}`} className="flex-shrink-0">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700">
            {bypass ? (
              <img src={avatarSrc} alt={getAvatarAlt(user)} className="object-cover w-full h-full" />
            ) : (
              <Image src={avatarSrc} alt={getAvatarAlt(user)} width={48} height={48} className="object-cover w-full h-full" />
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/u/${user.username}`} className="font-semibold text-white hover:text-indigo-300 text-sm transition-colors">
            {user.displayName || user.username}
          </Link>
          <p className="text-xs text-gray-500">@{user.username}</p>
          {user.bio && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{user.bio}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {user.mutualFriends > 0 && (
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <Users className="w-3 h-3" /> {user.mutualFriends} mutual friend{user.mutualFriends !== 1 ? "s" : ""}
          </span>
        )}
        {user.mutualFriends === 0 && <span />}

        {user.friendStatus === "none" && (
          <button
            onClick={onSendRequest}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            <UserPlus className="w-3 h-3" /> Add
          </button>
        )}
        {user.friendStatus === "friends" && (
          <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
            <Check className="w-3 h-3" /> Friends
          </span>
        )}
        {user.friendStatus === "pending_sent" && (
          <button
            onClick={onCancelRequest}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium transition-colors disabled:opacity-50 border border-red-500/30"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        )}
        {user.friendStatus === "pending_received" && (
          <Link
            href="/friends"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/20 hover:bg-indigo-500/20"
          >
            <UserPlus className="w-3 h-3" /> Respond
          </Link>
        )}
      </div>
    </div>
  );
}
