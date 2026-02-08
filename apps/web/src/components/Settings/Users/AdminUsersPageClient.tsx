"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import Image from "next/image";
import { logger } from "@/lib/logger";
import { 
  PencilIcon, 
  UserPlusIcon, 
  ArrowDownTrayIcon, 
  Bars3BottomLeftIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  Squares2X2Icon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  ArrowPathIcon,
  ArrowRightOnRectangleIcon
} from "@heroicons/react/24/solid";
import { CreateLocalUserModal } from "@/components/Settings/Users/CreateLocalUserModal";
import { JellyfinImportModal } from "@/components/Settings/Jellyfin/JellyfinImportModal";
import { useToast } from "@/components/Providers/ToastProvider";
import { getAvatarAlt, getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";
import { Modal } from "@/components/Common/Modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { csrfFetch } from "@/lib/csrf-client";
import { GROUP_DEFINITIONS, formatGroupLabel, normalizeGroupList } from "@/lib/groups";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface User {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
  groups: string[];
  banned: boolean;
  createdAt: string;
  jellyfinUserId: string | null;
  jellyfinUsername: string | null;
  avatarUrl: string | null;
  requestCount: number;
  weeklyDigestOptIn: boolean;
}

interface UsersResponse {
  results: User[];
  pageInfo: {
    page: number;
    pages: number;
    results: number;
    total: number;
  };
}

const SORT_OPTIONS = [
  { id: "displayname", name: "Display Name" },
  { id: "created", name: "Join Date" },
  { id: "requests", name: "Request Count" },
] as const;

export function AdminUsersPageClient() {
  const toast = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(10);
  const [currentSort, setCurrentSort] = useState<typeof SORT_OPTIONS[number]["id"]>("displayname");
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; user?: User }>({ isOpen: false });
  const [groupModal, setGroupModal] = useState<{ open: boolean; user?: User }>({ open: false });
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);

  const { data, error, mutate } = useSWR<UsersResponse>(
    `/api/v1/admin/users?page=${currentPage}&limit=${currentPageSize}&sort=${currentSort}&search=${debouncedSearch}`
  );

  const users = useMemo(() => data?.results ?? [], [data?.results]);
  const pageInfo = data?.pageInfo;

  const pageKey = `${currentPage}-${currentPageSize}-${currentSort}-${debouncedSearch}`;

  // Reset page when search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearch !== "") {
        setCurrentPage(1);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!users.length) return;
    users.forEach((user) => {
      const avatarSrc = getAvatarSrc({
        avatarUrl: user.avatarUrl,
        jellyfinUserId: user.jellyfinUserId,
        displayName: user.displayName,
        email: user.email
      });
      if (!avatarSrc || avatarSrc.startsWith("data:")) return;
      const img = new window.Image();
      img.decoding = "async";
      img.src = avatarSrc;
    });
  }, [users]);
  
  // Derive selected users based on page key and available user IDs
  const [selectionState, setSelectionState] = useState({ pageKey, ids: [] as number[] });
  const userIds = useMemo(() => users.map((u) => u.id), [users]);
  const selectedUserIds = useMemo(() => {
    const ids = selectionState.pageKey === pageKey ? selectionState.ids : [];
    return ids.filter((id) => userIds.includes(id));
  }, [selectionState, pageKey, userIds]);
  const setSelectedUserIds = useCallback((ids: number[] | ((prev: number[]) => number[])) => {
    setSelectionState(prev => {
      const currentIds = prev.pageKey === pageKey
        ? prev.ids.filter((id) => userIds.includes(id))
        : [];
      return {
        pageKey,
        ids: typeof ids === 'function' ? ids(currentIds) : ids
      };
    });
  }, [pageKey, userIds]);


  const handleToggleBan = async (user: User) => {
      try {
          const res = await fetch(`/api/v1/admin/users/${user.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ banned: !user.banned })
          });
          if (res.ok) {
              toast.success(`User ${user.banned ? "unbanned" : "banned"} successfully`);
              mutate();
          } else {
              const data = await res.json();
              toast.error(data.error || "Failed to update user status");
          }
      } catch (error) {
          logger.error("[AdminUsers] Error updating user ban status", error);
          toast.error("Failed to update user status");
      }
  };

  const handleLogoutSessions = async (user: User) => {
    try {
      const res = await csrfFetch(`/api/v1/admin/users/${user.id}/logout-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to logout sessions");
      }
      toast.success("All sessions revoked for user");
    } catch (error) {
      logger.error("[AdminUsers] Error logging out sessions", error);
      toast.error("Failed to revoke sessions");
    }
  };

  const handleRotateFeed = async (user: User) => {
    try {
      const res = await csrfFetch(`/api/v1/admin/users/${user.id}/calendar-feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to rotate feed link");
      }
      const data = await res.json().catch(() => ({}));
      if (data?.webcalUrl) {
        try {
          await navigator.clipboard.writeText(data.webcalUrl);
          toast.success("Calendar feed rotated and copied");
          return;
        } catch {
          // Ignore clipboard errors
        }
      }
      toast.success("Calendar feed rotated");
    } catch (error) {
      logger.error("[AdminUsers] Error rotating feed", error);
      toast.error("Failed to rotate feed link");
    }
  };

  const handleDeleteUser = async (userId: number) => {
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        mutate();
        setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
        setDeleteModal({ isOpen: false });
      }
    } catch (error) {
      logger.error("[AdminUsers] Error deleting user", error);
    }
  };

  const openGroupModal = (user: User) => {
    setGroupSelection(normalizeGroupList(user.groups));
    setGroupModal({ open: true, user });
  };

  const closeGroupModal = () => {
    if (groupSaving) return;
    setGroupModal({ open: false });
    setGroupSelection([]);
  };

  const toggleGroup = (groupId: string) => {
    setGroupSelection((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return Array.from(next);
    });
  };

  const saveGroups = async () => {
    if (!groupModal.user) return;
    setGroupSaving(true);
    try {
      const groups = normalizeGroupList(groupSelection);
      const res = await csrfFetch(`/api/v1/admin/users/${groupModal.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update groups");
      }
      setGroupModal({ open: false });
      mutate();
      toast.success("Groups updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update groups");
    } finally {
      setGroupSaving(false);
    }
  };

  const allSelected = users.length > 0 && selectedUserIds.length === users.length;

  const toggleSelectUser = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUserIds(users.map((user) => user.id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleBulkEdit = () => {
    if (!selectedUserIds.length) {
      toast.error("Select at least one user to bulk edit.");
      return;
    }
    toast.success(`Selected ${selectedUserIds.length} user${selectedUserIds.length > 1 ? "s" : ""} for bulk edit.`);
  };

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Failed to load users
      </div>
    );
  }

  if (!data || !pageInfo) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">User List</h1>
          <p className="text-gray-400 text-sm mt-1">Manage local and imported users</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative group w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full rounded-lg border border-gray-600 bg-gray-800 !pl-12 pr-3 py-2 text-sm text-white placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-64 transition shadow-sm"
            />
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-10 items-center justify-center">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-400 transition" />
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setCreateModalOpen(true)}
              className="flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition shadow-sm inline-flex"
              title="Create Local User"
            >
              <UserPlusIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Create</span>
            </button>

            <button 
              onClick={() => setImportModalOpen(true)}
              className="flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition shadow-sm inline-flex"
              title="Import Users"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Import</span>
            </button>
            
            <button
              onClick={handleBulkEdit}
              disabled={!selectedUserIds.length}
              className="flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-amber-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex"
              title="Bulk Edit"
            >
              <Squares2X2Icon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Sort Row */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
        <div className="text-sm text-gray-400 pl-1">
           <span className="font-medium text-gray-300">{pageInfo.total}</span> users total
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-sm text-gray-400 whitespace-nowrap hidden sm:inline">Sort by:</span>
            <div className="w-full sm:w-56 z-20">
              <Select
                value={currentSort}
                onValueChange={(value) => setCurrentSort(value as typeof currentSort)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
          <label className="flex items-center gap-3 text-sm font-medium text-gray-300">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => toggleSelectAll(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
            />
            Select all
          </label>
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{selectedUserIds.length} selected</span>
        </div>

        {users.map((user) => {
          const avatarSrc = getAvatarSrc({
            avatarUrl: user.avatarUrl,
            jellyfinUserId: user.jellyfinUserId,
            displayName: user.displayName,
            email: user.email
          });
          const avatarAlt = getAvatarAlt({ displayName: user.displayName, email: user.email });

          return (
          <div key={user.id} className="group relative overflow-hidden rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm transition active:scale-[0.99]">
            <div className="flex items-start gap-4">
               {/* Selection Overlay Checkbox */}
               <div className="pt-1">
                 <input
                  type="checkbox"
                  checked={selectedUserIds.includes(user.id)}
                  onChange={() => toggleSelectUser(user.id)}
                  className="h-5 w-5 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
                 />
               </div>

              <PrefetchLink href={`/admin/users/${user.id}/settings`} className="flex items-center gap-4 min-w-0 flex-1">
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-800 ring-2 ring-gray-800">
                  <Image
                    src={avatarSrc}
                    alt={avatarAlt}
                    fill
                    className="object-cover"
                    unoptimized={shouldBypassNextImage(avatarSrc)}
                  />
                </div>
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                     <h3 className="truncate text-base font-semibold text-white">{user.displayName || user.email}</h3>
                   {user.isAdmin && (
                      <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400 ring-1 ring-inset ring-purple-500/20">
                        Admin
                      </span>
                   )}
                   {user.banned && (
                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 ring-1 ring-inset ring-red-500/20">
                        Banned
                      </span>
                   )}
                   {!user.email ? (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/20">
                        No email
                      </span>
                   ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                          user.weeklyDigestOptIn
                            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
                            : "bg-gray-800 text-gray-400 ring-gray-700"
                        }`}
                      >
                        Digest {user.weeklyDigestOptIn ? "on" : "off"}
                      </span>
                   )}
                  </div>
                  <div className="truncate text-sm text-gray-400">{user.email}</div>
                
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                     <span className="font-medium text-gray-300">{user.requestCount ?? 0}</span> Requests
                  </span>
                  <span className="h-1 w-1 rounded-full bg-gray-700"></span>
                  <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
                </div>
              </PrefetchLink>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(user.groups?.length ? user.groups : ["users"]).map((group) => (
                <span
                  key={group}
                  className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-300"
                >
                  {formatGroupLabel(group)}
                </span>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-4 gap-3 border-t border-gray-800 pt-3">
              <button
                onClick={() => handleToggleBan(user)}
                className={`flex items-center justify-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium transition ${
                    user.id === 1 
                        ? "cursor-not-allowed bg-gray-800/50 text-gray-600"
                        : user.banned
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                }`}
                disabled={user.id === 1}
              >
                <NoSymbolIcon className="h-4 w-4" />
                {user.banned ? "Unban" : "Ban"}
              </button>
              <PrefetchLink
                href={`/admin/users/${user.id}/settings`}
                className="flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700 hover:text-white"
              >
                <PencilIcon className="h-4 w-4" />
                Edit
              </PrefetchLink>
              <button
                onClick={() => openGroupModal(user)}
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 px-3 py-2 text-sm font-medium transition"
              >
                <Bars3BottomLeftIcon className="h-4 w-4" />
                Groups
              </button>
              <button
                onClick={() => setDeleteModal({ isOpen: true, user })}
                className={`flex items-center justify-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium transition ${user.id === 1
                    ? "cursor-not-allowed bg-gray-800/50 text-gray-600"
                    : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  }`}
                disabled={user.id === 1}
              >
                Delete
              </button>
              <button
                onClick={() => handleLogoutSessions(user)}
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 px-3 py-2 text-sm font-medium transition"
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                Logout devices
              </button>
              <button
                onClick={() => handleRotateFeed(user)}
                className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 px-3 py-2 text-sm font-medium transition"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Rotate feed
              </button>
            </div>
          </div>
        );
        })}
      </div>

      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-800 bg-gray-900/50 shadow-sm">
        <table className="min-w-full">
          <thead className="bg-gray-900 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-6 py-4 w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
                />
              </th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Groups</th>
              <th className="px-6 py-4">Digest</th>
              <th className="px-6 py-4 text-center">Requests</th>
              <th className="px-6 py-4">Joined</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map((user) => {
              const avatarSrc = getAvatarSrc({
                avatarUrl: user.avatarUrl,
                jellyfinUserId: user.jellyfinUserId,
                displayName: user.displayName,
                email: user.email
              });
              const avatarAlt = getAvatarAlt({ displayName: user.displayName, email: user.email });

              return (
              <tr key={user.id} className="group transition hover:bg-gray-800/40">
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => toggleSelectUser(user.id)}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900 transition opacity-50 group-hover:opacity-100"
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-800 ring-2 ring-transparent group-hover:ring-gray-700 transition">
                      <Image
                        src={avatarSrc}
                        alt={avatarAlt}
                        fill
                        className="object-cover"
                        unoptimized={shouldBypassNextImage(avatarSrc)}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white group-hover:text-indigo-200 transition">{user.displayName || user.email}</div>
                      <div className="truncate text-xs text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {(user.groups?.length ? user.groups : ["users"]).map((group) => (
                      <span
                        key={group}
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                          group === "administrators"
                            ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            : group === "moderators"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                              : "bg-gray-800 text-gray-400 border-gray-700"
                        }`}
                      >
                        {formatGroupLabel(group)}
                      </span>
                    ))}
                    {user.banned && (
                      <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium border bg-red-500/10 text-red-400 border-red-500/20">
                        Banned
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm">
                  {!user.email ? (
                    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20">
                      No email
                    </span>
                  ) : (
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                        user.weeklyDigestOptIn
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                          : "bg-gray-800 text-gray-400 border-gray-700"
                      }`}
                    >
                      {user.weeklyDigestOptIn ? "Enabled" : "Disabled"}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-300 text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-800 text-gray-300 border border-gray-700">
                    {user.requestCount ?? 0}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleToggleBan(user)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 transition ${
                          user.id === 1
                            ? "cursor-not-allowed text-gray-600"
                            : user.banned
                                ? "text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/10"
                                : "text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/10"
                      }`}
                      disabled={user.id === 1}
                      title={user.banned ? "Unban User" : "Ban User"}
                    >
                      <NoSymbolIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleLogoutSessions(user)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-indigo-300 transition hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-100"
                      title="Logout all devices"
                    >
                      <ArrowRightOnRectangleIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleRotateFeed(user)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-100"
                      title="Rotate calendar feed"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                    </button>
                    <PrefetchLink
                      href={`/admin/users/${user.id}/settings`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-400 transition hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-400"
                      title="Edit User"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </PrefetchLink>
                    <button
                      onClick={() => openGroupModal(user)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-indigo-300 transition hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-100"
                      title="Edit Groups"
                    >
                      <Bars3BottomLeftIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, user })}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-400 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
                      disabled={user.id === 1}
                      title="Delete User"
                    >
                      <Squares2X2Icon className="h-4 w-4 rotate-45" /> {/* Using as X icon */}
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-6 md:flex-row">
        <div className="text-sm text-gray-400">
          Showing <span className="font-medium text-white">{(pageInfo.page - 1) * pageInfo.results + 1}</span> to <span className="font-medium text-white">{Math.min(pageInfo.page * pageInfo.results, pageInfo.total)}</span> of <span className="font-medium text-white">{pageInfo.total}</span> users
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={pageInfo.page === 1}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-gray-800 transition"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Prev
          </button>
          <div className="text-sm text-gray-300 bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 font-mono">
            {pageInfo.page} / {pageInfo.pages}
          </div>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, pageInfo.pages))}
            disabled={pageInfo.page === pageInfo.pages}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-gray-800 transition"
          >
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Delete Modal */}
      {deleteModal.isOpen && deleteModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white">Delete User</h2>
            <p className="mt-2 text-sm text-gray-400">
              Are you sure you want to delete <span className="font-semibold text-white">{deleteModal.user.displayName || deleteModal.user.email}</span>? This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false })}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(deleteModal.user!.id)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={groupModal.open} title="Edit Groups" onClose={closeGroupModal}>
        {groupModal.user ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-400">
              Update groups for <span className="font-semibold text-white">{groupModal.user.displayName}</span>.
            </div>
            <div className="space-y-2">
              {GROUP_DEFINITIONS.map((group) => (
                <label
                  key={group.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-semibold text-white">{group.label}</div>
                    <div className="text-xs text-gray-400">{group.id}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={groupSelection.includes(group.id)}
                    onChange={() => toggleGroup(group.id)}
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeGroupModal}
                className="btn bg-surface hover:bg-surface-strong text-muted text-xs"
                disabled={groupSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveGroups}
                className="btn btn-primary text-xs"
                disabled={groupSaving}
              >
                {groupSaving ? "Saving..." : "Save Groups"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modals */}
      <CreateLocalUserModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onComplete={() => mutate()} />
      <JellyfinImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} onComplete={() => mutate()} />
    </section>
  );
}
