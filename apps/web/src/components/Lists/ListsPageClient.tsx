"use client";

import { useState, useEffect } from "react";
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
  Film,
  Tv,
  Edit2,
  Eye,
  EyeOff,
  ExternalLink,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
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

export function ListsPageClient({ imageProxyEnabled }: { imageProxyEnabled: boolean }) {
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

  useEffect(() => {
    fetchLists();
  }, []);

  // Listen for create modal open event from hero
  useEffect(() => {
    const handleOpenCreateModal = () => {
      setCreateModalOpen(true);
    };
    
    window.addEventListener('openCreateListModal', handleOpenCreateModal);
    return () => window.removeEventListener('openCreateListModal', handleOpenCreateModal);
  }, []);

  const fetchLists = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/lists", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load lists");
      const data = await res.json();
      setLists(data.lists || []);

      const covers: Record<number, string> = {};
      for (const list of data.lists || []) {
        // Prioritize custom cover image if it exists
        if (list.customCoverImagePath) {
          try {
            covers[list.id] = `/api/v1/lists/${list.id}/cover/image`;
          } catch {
            // ignore
          }
        } else if (list.coverTmdbId && list.coverMediaType) {
          // Fall back to TMDB cover if no custom image
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
  };

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
        body: JSON.stringify({
          name: editName,
          description: editDescription,
        }),
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
        body: JSON.stringify({
          isPublic: !list.isPublic,
        }),
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

  return (
    <div className="space-y-8">
      <div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-gray-800/50 rounded-2xl animate-pulse border border-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center max-w-lg mx-auto">
            <p className="text-red-200 mb-4">{error}</p>
            <button
              onClick={fetchLists}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
            >
              Retry
            </button>
          </div>
        ) : lists.length === 0 ? (
          // Empty State
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="relative mb-8 group">
              <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full group-hover:bg-blue-500/30 transition-all duration-500" />
              <div className="relative bg-gray-900 border border-white/10 p-6 rounded-3xl shadow-2xl transform group-hover:scale-105 transition-transform duration-500">
                <LayoutGrid className="w-12 h-12 text-blue-400" />
              </div>
              
              {/* Floating Icons decoration */}
              <div className="absolute -top-4 -right-8 bg-gray-800 border border-gray-700 p-3 rounded-2xl transform rotate-12 animate-pulse" style={{ animationDuration: '4s' }}>
                <Film className="w-5 h-5 text-purple-400" />
              </div>
              <div className="absolute -bottom-2 -left-8 bg-gray-800 border border-gray-700 p-3 rounded-2xl transform -rotate-12 animate-pulse" style={{ animationDelay: '1s', animationDuration: '5s' }}>
                <Tv className="w-5 h-5 text-emerald-400" />
              </div>
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">No lists created yet</h3>
            <p className="text-base text-gray-400 max-w-md mb-8 leading-relaxed">
              Start organizing your favorite movies and TV shows by creating your first custom list. Share it with friends or keep it private.
            </p>

            <button
              onClick={() => setCreateModalOpen(true)}
              className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-semibold shadow-xl shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              Create Your First List
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {lists.map((list) => (
              <div
                key={list.id}
                className="group relative bg-gray-900 border border-white/5 rounded-2xl overflow-hidden hover:border-white/20 hover:shadow-2xl hover:shadow-blue-900/10 transition-all duration-300"
              >
                {/* Cover Image Area */}
                <Link href={`/lists/${list.id}`} className="block relative aspect-[16/9] overflow-hidden">
                  <div className="absolute inset-0 bg-gray-800 animate-pulse" />
                  {coverImages[list.id] ? (
                    <Image
                      src={coverImages[list.id]}
                      alt={list.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                      <List className="w-10 h-10 text-gray-600" />
                    </div>
                  )}
                  
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/20 to-transparent opacity-80" />
                  
                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="px-2.5 py-1 text-xs font-medium text-white bg-black/40 backdrop-blur-md border border-white/10 rounded-lg">
                      {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                    </span>
                  </div>
                  
                  <div className="absolute top-3 right-3">
                    {list.isPublic ? (
                      <div className="p-1.5 bg-emerald-500/20 backdrop-blur-md rounded-lg text-emerald-400 border border-emerald-500/20" title="Public List">
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="p-1.5 bg-gray-500/20 backdrop-blur-md rounded-lg text-gray-400 border border-gray-500/20" title="Private List">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                </Link>

                {/* Content Area */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Link href={`/lists/${list.id}`} className="block group/title">
                        <h3 className="font-semibold text-lg text-white truncate mb-1 group-hover/title:text-blue-400 transition-colors">
                          {list.name}
                        </h3>
                      </Link>
                      <p className="text-sm text-gray-400 line-clamp-2 h-10">
                        {list.description || "No description provided."}
                      </p>
                    </div>

                    <div className="relative">
                      <button
                        onClick={() => setActiveMenu(activeMenu === list.id ? null : list.id)}
                        className={`p-2 rounded-xl transition-all ${
                          activeMenu === list.id
                            ? "bg-white/10 text-white" 
                            : "text-gray-400 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>

                      {activeMenu === list.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setActiveMenu(null)}
                          />
                          <div className="absolute right-0 top-full mt-2 z-20 w-56 bg-gray-900 border border-white/10 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                            <button
                              onClick={() => {
                                setEditTarget(list);
                                setEditName(list.name);
                                setEditDescription(list.description || "");
                                setActiveMenu(null);
                              }}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors w-full text-left"
                            >
                              <Edit2 className="w-4 h-4" />
                              Edit List
                            </button>
                            
                            <button
                              onClick={() => {
                                window.location.href = `/lists/${list.id}`;
                              }}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors w-full text-left border-t border-white/5"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Open List
                            </button>
                            
                            <button
                              onClick={() => handleTogglePublic(list)}
                              disabled={updatingVisibility === list.id}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors w-full text-left border-t border-white/5 disabled:opacity-60"
                            >
                              {list.isPublic ? (
                                <>
                                  <Eye className="w-4 h-4" />
                                  Make Private
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-4 h-4" />
                                  Make Public
                                </>
                              )}
                            </button>
                            
                            {list.isPublic && (
                              <button
                                onClick={() => copyShareLink(list)}
                                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors w-full text-left border-t border-white/5"
                              >
                                {copiedId === list.id ? (
                                  <>
                                    <Check className="w-4 h-4 text-emerald-400" />
                                    <span className="text-emerald-400">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Share2 className="w-4 h-4" />
                                    Copy Share Link
                                  </>
                                )}
                              </button>
                            )}
                            
                            <button
                              onClick={() => {
                                setDeleteTarget(list);
                                setActiveMenu(null);
                              }}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors w-full text-left border-t border-white/5"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete List
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
                    <span>Updated {new Date(list.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
            <label className="block text-sm font-medium text-gray-300 mb-2">
              List Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={editing}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
              placeholder="Enter list name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={editing}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none disabled:opacity-60"
              placeholder="Enter list description"
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
              onClick={() => {
                if (editing) return;
                setEditTarget(null);
                setEditError(null);
              }}
              disabled={editing}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEdit}
              disabled={editing || !editName.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
              onClick={() => {
                if (deleting) return;
                setDeleteTarget(null);
                setDeleteError(null);
              }}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
