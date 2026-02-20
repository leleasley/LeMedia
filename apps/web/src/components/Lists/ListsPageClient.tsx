"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  List,
  Lock,
  Globe,
  MoreVertical,
  Trash2,
  Share2,
  Check,
  LayoutGrid,
  LayoutList,
  Film,
  Tv,
  Edit2,
  Eye,
  EyeOff,
  ExternalLink,
  AlertCircle,
  Search,
  ArrowUpDown,
  Calendar,
  Hash,
  SortAsc,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { CreateListModal } from "./CreateListModal";
import { tmdbImageUrl } from "@/lib/tmdb-images";
import { Modal } from "@/components/Common/Modal";
import { csrfFetch } from "@/lib/csrf-client";

interface CustomList {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  shareId: string;
  shareSlug: string | null;
  coverTmdbId: number | null;
  coverMediaType: "movie" | "tv" | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  customCoverImagePath?: string | null;
  customCoverImageSize?: number | null;
  customCoverImageMimeType?: string | null;
}

type SortOption = "updated" | "created" | "name" | "items";
type ViewMode = "grid" | "list";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ListsPageClient({ imageProxyEnabled }: { imageProxyEnabled: boolean }) {
  const toast = useToast();
  const [lists, setLists] = useState<CustomList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [coverImages, setCoverImages] = useState<Record<number, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<CustomList | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<CustomList | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [updatingVisibility, setUpdatingVisibility] = useState<number | null>(null);

  // New UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("updated");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  useEffect(() => {
    const handleOpenCreateModal = () => setCreateModalOpen(true);
    window.addEventListener("openCreateListModal", handleOpenCreateModal);
    return () => window.removeEventListener("openCreateListModal", handleOpenCreateModal);
  }, []);

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/lists", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load lists");
      const data = await res.json();
      setLists(data.lists || []);

      const covers: Record<number, string> = {};
      for (const list of data.lists || []) {
        if (list.customCoverImagePath) {
          covers[list.id] = `/api/v1/lists/${list.id}/cover/image`;
        } else if (list.coverTmdbId && list.coverMediaType) {
          try {
            const tmdbRes = await fetch(
              `/api/v1/tmdb/${list.coverMediaType}/${list.coverTmdbId}`
            );
            if (tmdbRes.ok) {
              const tmdb = await tmdbRes.json();
              if (tmdb.poster_path) {
                const imgUrl = tmdbImageUrl(tmdb.poster_path, "w342", imageProxyEnabled);
                if (imgUrl) covers[list.id] = imgUrl;
              }
            }
          } catch {
            // ignore
          }
        }
      }
      setCoverImages(covers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lists");
    } finally {
      setLoading(false);
    }
  }, [imageProxyEnabled]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const filteredAndSorted = useMemo(() => {
    let result = [...lists];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.description && l.description.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        case "items":
          return b.itemCount - a.itemCount;
        default:
          return 0;
      }
    });
    return result;
  }, [lists, searchQuery, sortBy]);

  const totalItems = useMemo(() => lists.reduce((s, l) => s + l.itemCount, 0), [lists]);
  const publicCount = useMemo(() => lists.filter((l) => l.isPublic).length, [lists]);

  const handleDelete = async (listId: number) => {
    if (deleting) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      const res = await csrfFetch(`/api/v1/lists/${listId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to delete list");
      }
      setLists((prev) => prev.filter((l) => l.id !== listId));
      setDeleteTarget(null);
      toast.success("List deleted successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete list";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = async () => {
    if (!editTarget || editing) return;
    try {
      setEditing(true);
      setEditError(null);
      const res = await csrfFetch(`/api/v1/lists/${editTarget.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDescription }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to update list");
      }
      const updatedList = await res.json();
      setLists((prev) =>
        prev.map((l) => (l.id === editTarget.id ? updatedList.list : l))
      );
      setEditTarget(null);
      toast.success("List updated successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update list";
      setEditError(message);
      toast.error(message);
    } finally {
      setEditing(false);
    }
  };

  const handleTogglePublic = async (list: CustomList) => {
    if (updatingVisibility === list.id) return;
    try {
      setUpdatingVisibility(list.id);
      const res = await csrfFetch(`/api/v1/lists/${list.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !list.isPublic }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to update list");
      }
      const updatedList = await res.json();
      setLists((prev) =>
        prev.map((l) => (l.id === list.id ? updatedList.list : l))
      );
      setActiveMenu(null);
      toast.success(`List is now ${!list.isPublic ? "public" : "private"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update list";
      toast.error(message);
    } finally {
      setUpdatingVisibility(null);
    }
  };

  const copyShareLink = async (list: CustomList) => {
    const shareKey = list.shareSlug || list.shareId;
    const url = `${window.location.origin}/share/list/${shareKey}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(list.id);
    toast.success("Share link copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
    setActiveMenu(null);
  };

  const sortLabels: Record<SortOption, { label: string; icon: React.ReactNode }> = {
    updated: { label: "Recently Updated", icon: <Calendar className="w-3.5 h-3.5" /> },
    created: { label: "Date Created", icon: <Calendar className="w-3.5 h-3.5" /> },
    name: { label: "Name", icon: <SortAsc className="w-3.5 h-3.5" /> },
    items: { label: "Item Count", icon: <Hash className="w-3.5 h-3.5" /> },
  };

  // ── Context menu dropdown (shared between views) ───────────────────
  const renderContextMenu = (list: CustomList) => (
    <div className="relative z-30">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setActiveMenu(activeMenu === list.id ? null : list.id);
        }}
        className={`p-1.5 rounded-lg transition-all ${
          activeMenu === list.id
            ? "bg-white/10 text-white"
            : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
        }`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {activeMenu === list.id && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
            <button
              onClick={() => {
                setEditTarget(list);
                setEditName(list.name);
                setEditDescription(list.description || "");
                setActiveMenu(null);
              }}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-300 hover:bg-white/5 transition-colors w-full text-left"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              onClick={() => { window.location.href = `/lists/${list.id}`; }}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-300 hover:bg-white/5 transition-colors w-full text-left border-t border-white/5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </button>
            <button
              onClick={() => handleTogglePublic(list)}
              disabled={updatingVisibility === list.id}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-300 hover:bg-white/5 transition-colors w-full text-left border-t border-white/5 disabled:opacity-60"
            >
              {list.isPublic ? (
                <><EyeOff className="w-3.5 h-3.5" /> Make Private</>
              ) : (
                <><Eye className="w-3.5 h-3.5" /> Make Public</>
              )}
            </button>
            {list.isPublic && (
              <button
                onClick={() => copyShareLink(list)}
                className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-300 hover:bg-white/5 transition-colors w-full text-left border-t border-white/5"
              >
                {copiedId === list.id ? (
                  <><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Copied!</span></>
                ) : (
                  <><Share2 className="w-3.5 h-3.5" /> Share Link</>
                )}
              </button>
            )}
            <button
              onClick={() => { setDeleteTarget(list); setActiveMenu(null); }}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors w-full text-left border-t border-white/5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ── Cover thumbnail (shared between views) ────────────────────────
  const renderCover = (list: CustomList, className: string) =>
    coverImages[list.id] ? (
      <Image src={coverImages[list.id]} alt={list.name} fill className={className} />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
        <List className="w-8 h-8 text-gray-700" />
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      {/* ── Loading ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-6 pt-2">
          {/* Skeleton toolbar */}
          <div className="h-10 w-64 bg-gray-800/40 rounded-xl animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-[2/3] bg-gray-800/40 rounded-xl animate-pulse" />
                <div className="h-4 w-3/4 bg-gray-800/30 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-gray-800/20 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        /* ── Error ──────────────────────────────────────────────────── */
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-10 text-center max-w-md mx-auto mt-12">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <p className="text-red-200 mb-5 text-sm">{error}</p>
          <button
            onClick={fetchLists}
            className="px-5 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : lists.length === 0 ? (
        /* ── Empty State ────────────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="relative mb-10">
            <div className="absolute -inset-4 bg-indigo-500/10 blur-3xl rounded-full" />
            <div className="relative bg-gray-900/80 border border-white/[0.08] p-7 rounded-3xl shadow-2xl">
              <FolderOpen className="w-14 h-14 text-indigo-400" />
            </div>
            <div className="absolute -top-3 -right-6 bg-gray-800/80 border border-gray-700/50 p-2.5 rounded-xl rotate-12">
              <Film className="w-4 h-4 text-purple-400" />
            </div>
            <div className="absolute -bottom-2 -left-6 bg-gray-800/80 border border-gray-700/50 p-2.5 rounded-xl -rotate-12">
              <Tv className="w-4 h-4 text-emerald-400" />
            </div>
          </div>

          <h3 className="text-2xl font-bold text-white mb-2">Start your first list</h3>
          <p className="text-sm text-gray-500 max-w-sm mb-8 leading-relaxed">
            Organize movies and TV shows into curated collections. Keep them private or share with friends.
          </p>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="group inline-flex items-center gap-2.5 px-7 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-semibold text-sm shadow-xl shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30 active:scale-[0.98]"
          >
            <Plus className="w-4.5 h-4.5 group-hover:rotate-90 transition-transform duration-300" />
            Create Your First List
          </button>
        </div>
      ) : (
        /* ── Main Content ───────────────────────────────────────────── */
        <div className="space-y-6 pt-1">
          {/* Stats chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-400">
              {lists.length} {lists.length === 1 ? "list" : "lists"}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-400">
              {totalItems} {totalItems === 1 ? "item" : "items"}
            </span>
            {publicCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-emerald-400">
                <Globe className="w-3 h-3 inline -mt-0.5 mr-1" />
                {publicCount} public
              </span>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lists..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.06] transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Sort dropdown */}
              <div className="relative">
                <button
                  onClick={() => setSortMenuOpen(!sortMenuOpen)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-gray-400 hover:text-white hover:border-white/15 transition-all"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{sortLabels[sortBy].label}</span>
                </button>
                {sortMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSortMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                      {(Object.keys(sortLabels) as SortOption[]).map((key) => (
                        <button
                          key={key}
                          onClick={() => { setSortBy(key); setSortMenuOpen(false); }}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] w-full text-left transition-colors ${
                            sortBy === key
                              ? "text-indigo-400 bg-indigo-500/10"
                              : "text-gray-400 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          {sortLabels[key].icon}
                          {sortLabels[key].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* View toggle */}
              <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md transition-all ${
                    viewMode === "grid"
                      ? "bg-white/10 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md transition-all ${
                    viewMode === "list"
                      ? "bg-white/10 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  title="List view"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* No search results */}
          {filteredAndSorted.length === 0 && searchQuery.trim() && (
            <div className="text-center py-16">
              <Search className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No lists matching &quot;{searchQuery}&quot;</p>
            </div>
          )}

          {/* ── Grid View ─────────────────────────────────────────── */}
          {viewMode === "grid" && filteredAndSorted.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {filteredAndSorted.map((list) => (
                <div
                  key={list.id}
                  className="group relative flex flex-col rounded-xl bg-gray-900/60 border border-white/[0.06] hover:border-white/15 hover:shadow-xl hover:shadow-indigo-950/20 transition-all duration-300"
                >
                  {/* Poster cover */}
                  <Link href={`/lists/${list.id}`} className="block relative aspect-[2/3] overflow-hidden rounded-t-xl">
                    {renderCover(list, "object-cover transition-transform duration-500 group-hover:scale-105")}
                    {/* Gradient overlays */}
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/30 to-transparent opacity-90" />
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* Top badges */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
                      <span className="px-2 py-0.5 text-[11px] font-medium text-white/90 bg-black/50 backdrop-blur-sm rounded-md border border-white/10">
                        {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                      </span>
                      {list.isPublic ? (
                        <div className="p-1 bg-emerald-500/20 backdrop-blur-sm rounded-md text-emerald-400 border border-emerald-500/20" title="Public">
                          <Globe className="w-3 h-3" />
                        </div>
                      ) : (
                        <div className="p-1 bg-gray-500/20 backdrop-blur-sm rounded-md text-gray-400 border border-gray-500/20" title="Private">
                          <Lock className="w-3 h-3" />
                        </div>
                      )}
                    </div>

                    {/* Bottom info overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-3.5">
                      <h3 className="font-semibold text-sm text-white leading-snug line-clamp-2 mb-1 group-hover:text-indigo-200 transition-colors">
                        {list.name}
                      </h3>
                      {list.description && (
                        <p className="text-[11px] text-gray-400 line-clamp-1 leading-relaxed">
                          {list.description}
                        </p>
                      )}
                    </div>
                  </Link>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.04]">
                    <span className="text-[11px] text-gray-600">{relativeTime(list.updatedAt)}</span>
                    {renderContextMenu(list)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── List View ─────────────────────────────────────────── */}
          {viewMode === "list" && filteredAndSorted.length > 0 && (
            <div className="space-y-2">
              {filteredAndSorted.map((list) => (
                <div
                  key={list.id}
                  className="group flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/12 transition-all"
                >
                  {/* Thumbnail */}
                  <Link
                    href={`/lists/${list.id}`}
                    className="relative w-14 h-20 sm:w-16 sm:h-24 flex-shrink-0 rounded-lg overflow-hidden"
                  >
                    {renderCover(list, "object-cover")}
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/lists/${list.id}`} className="block group/t">
                      <h3 className="font-semibold text-sm text-white truncate group-hover/t:text-indigo-300 transition-colors">
                        {list.name}
                      </h3>
                    </Link>
                    {list.description && (
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{list.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                      </span>
                      <span>{relativeTime(list.updatedAt)}</span>
                      {list.isPublic ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <Globe className="w-3 h-3" /> Public
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Private
                        </span>
                      )}
                    </div>
                  </div>

                  {renderContextMenu(list)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────── */}
      <CreateListModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(list) => {
          setLists((prev) => [
            {
              ...list,
              description: null,
              isPublic: list.isPublic ?? false,
              shareSlug: list.shareSlug ?? null,
              coverTmdbId: null,
              coverMediaType: null,
              itemCount: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as CustomList,
            ...prev,
          ]);
          void fetchLists();
        }}
      />

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => {
          if (editing) return;
          setEditTarget(null);
          setEditError(null);
        }}
        title="Edit List"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={editing}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
              placeholder="List name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={editing}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none disabled:opacity-60"
              placeholder="Optional description"
            />
          </div>
          {editError && (
            <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-200">{editError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { if (editing) return; setEditTarget(null); setEditError(null); }}
              disabled={editing}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEdit}
              disabled={editing || !editName.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {editing ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (deleting) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        title="Delete list"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            Are you sure you want to delete <span className="text-white font-semibold">{deleteTarget?.name}</span>?
            This cannot be undone.
          </p>
          {deleteError && (
            <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-200">{deleteError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { if (deleting) return; setDeleteTarget(null); setDeleteError(null); }}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
