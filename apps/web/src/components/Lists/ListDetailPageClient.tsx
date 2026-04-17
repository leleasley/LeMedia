"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Providers/ToastProvider";
import {
  ArrowLeft,
  Share2,
  Settings,
  Edit2,
  Trash2,
  Plus,
  GripVertical,
  X,
  Check,
  Lock,
  Globe,
  MoreVertical,
  Calendar,
  Star,
  Film,
  Tv,
  LayoutGrid,
  Users
} from "lucide-react";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import { Modal } from "@/components/Common/Modal";
import { ListSocialBar } from "@/components/Social/ListSocialBar";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { csrfFetch } from "@/lib/csrf-client";
import { MediaStatus } from "@/components/Common/StatusBadgeMini";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

interface ListItem {
  id: number;
  listId: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  position: number;
  note: string | null;
  addedAt: string;
  title: string;
  posterUrl: string | null;
  year: string;
  rating: number;
  description: string;
  mediaStatus?: MediaStatus;
}

interface CustomList {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  visibility?: "private" | "friends" | "public";
  shareId: string;
  shareSlug?: string | null;
  mood?: string | null;
  occasion?: string | null;
  itemCount: number;
  allowComments?: boolean;
  allowReactions?: boolean;
  allowRemix?: boolean;
  coverTmdbId?: number | null;
  coverMediaType?: "movie" | "tv" | null;
  customCoverImagePath?: string | null;
  customCoverImageSize?: number | null;
  customCoverImageMimeType?: string | null;
  ownerUsername?: string;
  accessRole?: "owner" | "editor" | "viewer";
  isOwner?: boolean;
  canEdit?: boolean;
  collaboratorCount?: number;
  updatedAt?: string | null;
}

interface ListCollaborator {
  userId: number;
  username: string;
  displayName: string | null;
  role: "editor" | "viewer";
  addedAt: string;
}

function unwrapApiData<T>(payload: any): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }
  return (payload ?? null) as T | null;
}

function SortableItem({
  item,
  onRemove,
  editMode,
}: {
  item: ListItem;
  onRemove: (item: ListItem) => void;
  editMode: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group h-full">
      {editMode && (
        <>
          <button
            className="absolute -top-2 -right-2 z-30 p-1.5 bg-red-600 hover:bg-red-500 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(item);
            }}
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 left-2 z-30 p-2 bg-black/60 backdrop-blur-md rounded-lg cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 border border-white/10"
          >
            <GripVertical className="w-4 h-4 text-white" />
          </div>
          {/* Overlay to prevent clicks on card during edit mode */}
          <div className="absolute inset-0 z-10 bg-black/10 rounded-xl" />
        </>
      )}
      <div className={`transition-all duration-300 ${editMode ? 'scale-95 opacity-90' : ''}`}>
        <HoverMediaCard
          id={item.tmdbId}
          title={item.title}
          posterUrl={item.posterUrl}
          href={`/${item.mediaType}/${item.tmdbId}`}
          year={item.year}
          rating={item.rating}
          description={item.description}
          mediaType={item.mediaType}
          mediaStatus={item.mediaStatus}
          cardMode="requestable"
        />
      </div>
    </div>
  );
}

export function ListDetailPageClient({
  listId,
  initialList,
  collaborators: initialCollaborators,
  initialItems,
}: {
  listId: number;
  initialList: CustomList;
  collaborators: ListCollaborator[];
  initialItems: ListItem[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [items, setItems] = useState(initialItems);
  const [editMode, setEditMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(initialList.name);
  const [editDescription, setEditDescription] = useState(initialList.description ?? "");
  const [editIsPublic, setEditIsPublic] = useState(initialList.isPublic);
  const [editShareSlug, setEditShareSlug] = useState(initialList.shareSlug ?? "");
  const [editMood, setEditMood] = useState(initialList.mood ?? "");
  const [editOccasion, setEditOccasion] = useState(initialList.occasion ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareOrigin, setShareOrigin] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [collaborators, setCollaborators] = useState(initialCollaborators);
  const [collaboratorUsername, setCollaboratorUsername] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState<"editor" | "viewer">("editor");
  const [collaboratorError, setCollaboratorError] = useState<string | null>(null);
  const [savingCollaborator, setSavingCollaborator] = useState(false);
  const [updatingCollaboratorId, setUpdatingCollaboratorId] = useState<number | null>(null);
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleRemove = useCallback(
    async (item: ListItem) => {
      const originalItems = [...items];
      setItems((prev) => prev.filter((i) => i.id !== item.id));

      try {
        await csrfFetch(`/api/v1/lists/${listId}/items`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
          }),
        });
      } catch {
        // Revert on error
        setItems(originalItems);
      }
    },
    [listId, items]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);

      try {
        await csrfFetch(`/api/v1/lists/${listId}/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ itemIds: newItems.map((i) => i.id) }),
        });
      } catch {
        setItems(items);
      }
    },
    [items, listId]
  );

  const copyShareLink = async () => {
    const shareKey = list.shareSlug || list.shareId;
    const url = `${window.location.origin}/share/list/${shareKey}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser origin is only available client-side; not a data fetch
    setShareOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!editOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form field initialization from props when edit modal opens; not a data fetch
    setEditName(list.name);
    setEditDescription(list.description ?? "");
    setEditIsPublic(list.isPublic);
    setEditShareSlug(list.shareSlug ?? "");
    setEditMood(list.mood ?? "");
    setEditOccasion(list.occasion ?? "");
    setEditError(null);
  }, [editOpen, list]);

  const normalizeShareSlug = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const normalizedShareSlug = editShareSlug.trim() ? normalizeShareSlug(editShareSlug) : "";
  
  const shareSlugError = editShareSlug.trim()
    ? !normalizedShareSlug
      ? "Share URL needs letters or numbers."
      : normalizedShareSlug.length > 120
        ? "Share URL is too long."
        : null
    : null;

  const shareSlugPreview = normalizedShareSlug || normalizeShareSlug(editName) || "list";

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !editName.trim() || shareSlugError) return;
    setSaving(true);
    setEditError(null);
    try {
      const updatePayload: Record<string, unknown> = {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        mood: editMood.trim() || undefined,
        occasion: editOccasion.trim() || undefined,
        isPublic: editIsPublic,
      };
      if (editShareSlug.trim()) {
        updatePayload.shareSlug = normalizedShareSlug;
      } else {
        updatePayload.shareSlug = null;
      }
      
      const res = await csrfFetch(`/api/v1/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updatePayload),
      });
      
      const data = await res.json().catch(() => null);
      const responsePayload = unwrapApiData<{ list?: CustomList }>(data);
      if (!res.ok) {
        setEditError(data?.error || "Failed to update list");
        return;
      }
      
      const nextList = responsePayload?.list;
      if (nextList) {
        setList((prev) => ({
          ...prev,
          ...nextList,
          shareSlug: nextList.shareSlug ?? prev.shareSlug,
          updatedAt: nextList.updatedAt ?? prev.updatedAt,
        }));
      }
      setEditOpen(false);
    } catch {
      setEditError("Failed to update list");
    } finally {
      setSaving(false);
    }
  };

  const handleSetCover = async (item: ListItem) => {
    try {
      const res = await csrfFetch(`/api/v1/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          setAsCover: true,
        }),
      });
      if (res.ok) {
        setList((prev) => ({
          ...prev,
          coverTmdbId: item.tmdbId,
          coverMediaType: item.mediaType,
          customCoverImagePath: null,
        }));
      }
    } catch {
      // ignore
    }
  };

  const handleUploadCoverImage = async (file: File | undefined) => {
    if (!file) return;
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      
      const res = await csrfFetch(`/api/v1/lists/${listId}/cover`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json().catch(() => null);
      const payload = unwrapApiData<{ list?: CustomList }>(data);
      if (!res.ok) {
        toast.error(data?.error || "Failed to upload cover image");
        return;
      }

      const nextList = payload?.list;
      if (nextList) {
        setList((prev) => ({
          ...prev,
          ...nextList,
          updatedAt: nextList.updatedAt ?? prev.updatedAt,
        }));
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload cover image");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveCoverImage = async () => {
    try {
      const res = await csrfFetch(`/api/v1/lists/${listId}/cover`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await res.json().catch(() => null);
      const payload = unwrapApiData<{ list?: CustomList }>(data);
      if (!res.ok) {
        toast.error(data?.error || "Failed to remove cover image");
        return;
      }

      const nextList = payload?.list;
      if (nextList) {
        setList((prev) => ({
          ...prev,
          ...nextList,
          updatedAt: nextList.updatedAt ?? prev.updatedAt,
        }));
        toast.success("Cover image removed successfully");
      }
    } catch (error) {
      console.error("Remove error:", error);
      toast.error("Failed to remove cover image");
    }
  };

  const handleDelete = async () => {
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
      toast.success("List deleted successfully");
      router.push("/lists");
    } catch {
      setDeleteError("Failed to delete list");
    } finally {
      setDeleting(false);
    }
  };

  // Determine cover image
  const coverItem = useMemo(() => {
    if (list.coverTmdbId && list.coverMediaType) {
      const match = items.find(i => i.tmdbId === list.coverTmdbId && i.mediaType === list.coverMediaType);
      if (match?.posterUrl) return match;
    }
    return items.find(i => i.posterUrl);
  }, [items, list.coverTmdbId, list.coverMediaType]);

  const customCoverUrl = useMemo(() => {
    if (!list.customCoverImagePath) return null;
    const query = list.updatedAt ? `?v=${encodeURIComponent(list.updatedAt)}` : "";
    return `/api/v1/lists/${listId}/cover/image${query}`;
  }, [list.customCoverImagePath, list.updatedAt, listId]);

  const heroCoverUrl = customCoverUrl || coverItem?.posterUrl || null;

  const handleAddCollaborator = useCallback(async () => {
    if (!list.isOwner || savingCollaborator || !collaboratorUsername.trim()) return;

    try {
      setSavingCollaborator(true);
      setCollaboratorError(null);
      const res = await csrfFetch(`/api/v1/lists/${listId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: collaboratorUsername.trim(), role: collaboratorRole }),
      });
      const data = await res.json().catch(() => null);
      const payload = unwrapApiData<{ collaborator?: ListCollaborator }>(data);
      if (!res.ok || !payload?.collaborator) {
        throw new Error(data?.error || "Failed to add collaborator");
      }

      setCollaborators((prev) => {
        const next = prev.filter((entry) => entry.userId !== payload.collaborator!.userId);
        next.push(payload.collaborator!);
        return next.sort((left, right) => left.username.localeCompare(right.username));
      });
      setList((prev) => ({
        ...prev,
        collaboratorCount: collaborators.some((entry) => entry.userId === payload.collaborator!.userId)
          ? prev.collaboratorCount ?? collaborators.length
          : (prev.collaboratorCount ?? collaborators.length) + 1,
      }));
      setCollaboratorUsername("");
      setCollaboratorRole("editor");
      toast.success("Collaborator added");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add collaborator";
      setCollaboratorError(message);
      toast.error(message);
    } finally {
      setSavingCollaborator(false);
    }
  }, [collaboratorRole, collaboratorUsername, collaborators, list.isOwner, listId, savingCollaborator, toast]);

  const handleUpdateCollaboratorRole = useCallback(async (collaboratorUserId: number, role: "editor" | "viewer") => {
    if (!list.isOwner || updatingCollaboratorId) return;

    try {
      setUpdatingCollaboratorId(collaboratorUserId);
      const res = await csrfFetch(`/api/v1/lists/${listId}/collaborators`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ collaboratorUserId, role }),
      });
      const data = await res.json().catch(() => null);
      const payload = unwrapApiData<{ collaborator?: ListCollaborator }>(data);
      if (!res.ok || !payload?.collaborator) {
        throw new Error(data?.error || "Failed to update collaborator");
      }

      setCollaborators((prev) => prev.map((entry) => entry.userId === collaboratorUserId ? payload.collaborator! : entry));
      toast.success("Collaborator updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update collaborator");
    } finally {
      setUpdatingCollaboratorId(null);
    }
  }, [list.isOwner, listId, toast, updatingCollaboratorId]);

  const handleRemoveCollaborator = useCallback(async (collaboratorUserId: number) => {
    if (!list.isOwner || removingCollaboratorId) return;

    try {
      setRemovingCollaboratorId(collaboratorUserId);
      const res = await csrfFetch(`/api/v1/lists/${listId}/collaborators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ collaboratorUserId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove collaborator");
      }

      setCollaborators((prev) => prev.filter((entry) => entry.userId !== collaboratorUserId));
      setList((prev) => ({
        ...prev,
        collaboratorCount: Math.max((prev.collaboratorCount ?? collaborators.length) - 1, 0),
      }));
      toast.success("Collaborator removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove collaborator");
    } finally {
      setRemovingCollaboratorId(null);
    }
  }, [collaborators.length, list.isOwner, listId, removingCollaboratorId, toast]);

  return (
    <div className="pb-12">
      {/* Hero Header */}
      <div className="relative w-full border-b border-white/5 overflow-hidden">
        {heroCoverUrl && (
          <div className="absolute inset-0 z-0">
            <Image
              src={heroCoverUrl}
              alt=""
              fill
              className="object-cover opacity-[0.15] blur-3xl scale-110 select-none"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0f19]/60 to-[#0b0f19]" />
          </div>
        )}
        
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-8 pt-6 pb-8">
          <Link
            href="/lists"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group text-sm"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to lists
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                {list.isPublic ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-md text-green-400 text-xs font-medium">
                    <Globe className="w-3 h-3" />
                    Public
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-500/10 border border-gray-500/20 rounded-md text-gray-400 text-xs font-medium">
                    <Lock className="w-3 h-3" />
                    Private
                  </div>
                )}
                <span className="text-gray-600 text-xs">•</span>
                <span className="text-gray-400 text-xs">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                {list.ownerUsername && !list.isOwner && (
                  <>
                    <span className="text-gray-600 text-xs">•</span>
                    <span className="text-gray-400 text-xs">Shared by @{list.ownerUsername}</span>
                  </>
                )}
                {(list.collaboratorCount ?? 0) > 0 && (
                  <>
                    <span className="text-gray-600 text-xs">•</span>
                    <span className="text-gray-400 text-xs">{list.collaboratorCount} collaborator{(list.collaboratorCount ?? 0) === 1 ? "" : "s"}</span>
                  </>
                )}
                {list.updatedAt && (
                  <>
                    <span className="text-gray-600 text-xs">•</span>
                    <span className="text-gray-400 text-xs">{new Date(list.updatedAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                {list.name}
              </h1>
              
              {list.description && (
                <p className="text-base text-gray-400 leading-relaxed max-w-2xl">
                  {list.description}
                </p>
              )}

              {(list.mood || list.occasion) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {list.mood && (
                    <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-400">
                      {list.mood}
                    </span>
                  )}
                  {list.occasion && (
                    <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-400">
                      {list.occasion}
                    </span>
                  )}
                </div>
              )}

              {!list.isOwner && list.accessRole && (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300">
                  <Users className="h-3.5 w-3.5" />
                  {list.accessRole === "editor" ? "You can edit this shared list" : "You can view this shared list"}
                </div>
              )}
            </div>

            {/* Social interactions bar */}
            {list.isPublic && (
              <ListSocialBar
                listId={listId}
                allowComments={list.allowComments ?? true}
                allowReactions={list.allowReactions ?? true}
                allowRemix={list.allowRemix ?? true}
                isOwner={Boolean(list.isOwner)}
              />
            )}

            <div className="flex flex-wrap items-start gap-2 lg:pt-7">
              {list.isPublic && (
                <button
                  onClick={copyShareLink}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors border border-white/10"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                  {copied ? "Copied" : "Share"}
                </button>
              )}
              {list.isOwner && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors border border-white/10"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              )}
              {list.canEdit && (
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    editMode
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                  }`}
                >
                  {editMode ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                  {editMode ? "Done" : "Manage Items"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-8">
        {/* Empty State */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full" />
              <div className="relative bg-gray-900 border border-white/10 p-6 rounded-3xl shadow-2xl">
                <Plus className="w-10 h-10 text-blue-400" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Add your first item</h3>
            <p className="text-base text-gray-400 max-w-md mb-8 leading-relaxed">
              This list looks a bit empty. Search for movies and TV shows to start building your collection.
            </p>
            <Link
              href="/"
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02]"
            >
              Browse Content
            </Link>
          </div>
        ) : list.canEdit ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {items.map((item) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onRemove={handleRemove}
                    editMode={editMode}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {items.map((item) => (
              <div
                key={item.id}
                className="transition-all duration-300"
              >
                <HoverMediaCard
                  id={item.tmdbId}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  href={`/${item.mediaType}/${item.tmdbId}`}
                  year={item.year}
                  rating={item.rating}
                  description={item.description}
                  mediaType={item.mediaType}
                  mediaStatus={item.mediaStatus}
                  cardMode="requestable"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} title="List Settings" onClose={() => setEditOpen(false)}>
        <form onSubmit={handleSaveDetails} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                List Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={saving}
                maxLength={100}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
                placeholder="My Awesome List"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={saving}
                rows={3}
                maxLength={500}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none disabled:opacity-60"
                placeholder="What's this list about?"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Mood <span className="text-gray-500">(optional)</span></label>
                <input
                  type="text"
                  value={editMood}
                  onChange={(e) => setEditMood(e.target.value)}
                  disabled={saving}
                  maxLength={80}
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
                  placeholder="e.g. Chill, Intense"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Occasion <span className="text-gray-500">(optional)</span></label>
                <input
                  type="text"
                  value={editOccasion}
                  onChange={(e) => setEditOccasion(e.target.value)}
                  disabled={saving}
                  maxLength={80}
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
                  placeholder="e.g. Date Night"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-white/5">
                <div>
                  <h4 className="text-sm font-medium text-white">List Privacy</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    {editIsPublic ? "Anyone with the link can view this list" : "Only you can view this list"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditIsPublic(!editIsPublic)}
                  disabled={saving}
                  className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-60 ${
                    editIsPublic ? "bg-green-500" : "bg-gray-600"
                  }`}
                >
                  <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                    editIsPublic ? "translate-x-5" : "translate-x-0"
                  }`} />
                </button>
              </div>

              {editIsPublic && (
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Custom Share URL</label>
                  <div className="flex rounded-lg bg-gray-800 border border-white/10 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                    <div className="px-4 py-2.5 text-gray-500 text-sm border-r border-white/10 bg-white/5 select-none whitespace-nowrap">
                      /share/list/
                    </div>
                    <input
                      type="text"
                      value={editShareSlug}
                      onChange={(e) => setEditShareSlug(e.target.value)}
                      disabled={saving}
                      placeholder={shareSlugPreview}
                      className="flex-1 px-4 py-2.5 bg-transparent text-white focus:outline-none text-sm placeholder-gray-500 disabled:opacity-60"
                    />
                  </div>
                  {shareSlugError && (
                    <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                      <p className="text-xs text-red-200 flex-1">{shareSlugError}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-white">Collaborators</h4>
                  <p className="text-xs text-gray-400 mt-1">Invite people to co-curate this list or keep them view-only.</p>
                </div>
                <div className="text-xs text-gray-500">{collaborators.length} active</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px_auto] gap-3">
                <input
                  type="text"
                  value={collaboratorUsername}
                  onChange={(e) => setCollaboratorUsername(e.target.value)}
                  disabled={savingCollaborator}
                  placeholder="Username"
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
                />
                <AdaptiveSelect
                  value={collaboratorRole}
                  onValueChange={(value) => setCollaboratorRole(value as "editor" | "viewer")}
                  disabled={savingCollaborator}
                  options={[
                    { value: "editor", label: "Editor" },
                    { value: "viewer", label: "Viewer" },
                  ]}
                  triggerClassName="h-[46px] w-full rounded-lg bg-gray-800 border border-white/10 text-white focus:border-blue-500"
                  aria-label="Select collaborator role"
                />
                <button
                  type="button"
                  onClick={handleAddCollaborator}
                  disabled={savingCollaborator || !collaboratorUsername.trim()}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {savingCollaborator ? "Inviting..." : "Add"}
                </button>
              </div>

              {collaboratorError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {collaboratorError}
                </div>
              )}

              <div className="space-y-2">
                {collaborators.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
                    No collaborators yet.
                  </div>
                ) : (
                  collaborators.map((collaborator) => (
                    <div key={collaborator.userId} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">{collaborator.displayName || collaborator.username}</div>
                        <div className="text-xs text-gray-400">@{collaborator.username} • added {new Date(collaborator.addedAt).toLocaleDateString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AdaptiveSelect
                          value={collaborator.role}
                          onValueChange={(value) => handleUpdateCollaboratorRole(collaborator.userId, value as "editor" | "viewer")}
                          disabled={updatingCollaboratorId === collaborator.userId || removingCollaboratorId === collaborator.userId}
                          options={[
                            { value: "editor", label: "Editor" },
                            { value: "viewer", label: "Viewer" },
                          ]}
                          triggerClassName="h-10 min-w-[110px] rounded-lg bg-gray-800 border border-white/10 px-3 py-2 text-sm text-white"
                          aria-label={`Update role for ${collaborator.username}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveCollaborator(collaborator.userId)}
                          disabled={removingCollaboratorId === collaborator.userId || updatingCollaboratorId === collaborator.userId}
                          className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-60"
                        >
                          {removingCollaboratorId === collaborator.userId ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Cover Image Selection */}
            {items.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <label className="block text-sm font-medium text-gray-300 mb-3">Cover Image from List</label>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSetCover(item)}
                      disabled={saving}
                      className={`relative aspect-[2/3] rounded-lg overflow-hidden border-2 transition-all disabled:opacity-50 ${
                        list.coverTmdbId === item.tmdbId && list.coverMediaType === item.mediaType
                          ? "border-blue-500 opacity-100"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      {item.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-800" />
                      )}
                      {list.coverTmdbId === item.tmdbId && list.coverMediaType === item.mediaType && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <div className="bg-blue-500 rounded-full p-1">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Cover Image Upload */}
            <div className="pt-4 border-t border-white/10">
              <label className="block text-sm font-medium text-gray-300 mb-3">Or Upload Custom Cover Image</label>
              <div className="relative">
                <input
                  type="file"
                  id="cover-image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => handleUploadCoverImage(e.currentTarget.files?.[0])}
                  disabled={uploading}
                  className="hidden"
                />
                <label
                  htmlFor="cover-image"
                  className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg cursor-pointer transition-colors bg-white/5"
                >
                  {list.customCoverImagePath ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={customCoverUrl ?? `/api/v1/lists/${listId}/cover/image`}
                        alt="Custom cover"
                        className="w-16 h-20 object-cover rounded mb-2"
                      />
                      <p className="text-sm text-gray-400">Click to change</p>
                    </>
                  ) : (
                    <>
                      <Plus className="w-6 h-6 text-gray-400 mb-2" />
                      <p className="text-sm font-medium text-gray-300">Upload custom cover</p>
                      <p className="text-xs text-gray-500 mt-1">PNG, JPG, WebP, GIF up to 10MB</p>
                    </>
                  )}
                </label>
                {uploading && <p className="text-xs text-blue-400 mt-2">Uploading...</p>}
              </div>
              {list.customCoverImagePath && (
                <button
                  type="button"
                  onClick={() => handleRemoveCoverImage()}
                  disabled={uploading}
                  className="mt-3 px-4 py-2 text-xs bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/20 rounded-lg transition-colors disabled:opacity-60"
                >
                  Remove custom image
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-white/10">
             <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
              className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors px-2 py-2 text-left disabled:opacity-60"
            >
              Delete this list
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !editName.trim() || !!shareSlugError}
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete List">
        <div className="space-y-4">
           <p className="text-gray-300">
             Are you sure you want to delete <strong className="text-white">{list.name}</strong>? This action cannot be undone.
           </p>
           {deleteError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm">
                {deleteError}
              </div>
           )}
           <div className="flex justify-end gap-3">
             <button onClick={() => setDeleteOpen(false)} className="px-4 py-2 bg-gray-800 rounded-lg text-white">Cancel</button>
             <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
           </div>
        </div>
      </Modal>
    </div>
  );
}
