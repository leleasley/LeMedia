"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/Common/Modal";
import { Plus, List, Loader2 } from "lucide-react";
import { CreateListModal } from "./CreateListModal";
import { csrfFetch } from "@/lib/csrf-client";
import { mutate as globalMutate } from "swr";
import { triggerSocialFeedRefresh } from "@/lib/social-feed-refresh";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CustomList {
  id: number;
  name: string;
  itemCount: number;
  alreadyContains?: boolean;
}

interface AddToListModalProps {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
}

export function AddToListModal({
  open,
  onClose,
  tmdbId,
  mediaType,
  title,
}: AddToListModalProps) {
  const [lists, setLists] = useState<CustomList[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [addedTo, setAddedTo] = useState<Set<number>>(new Set());
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/lists?tmdbId=${tmdbId}&mediaType=${mediaType}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const containing = new Set<number>((data.containingListIds ?? []).map((id: number) => Number(id)));
        const nextLists = (data.lists || []).map((list: CustomList) => ({
          ...list,
          alreadyContains: containing.has(Number(list.id)),
        }));
        setLists(nextLists);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tmdbId, mediaType]);

  useEffect(() => {
    if (open) {
      setSelectedListId(null);
      setAddedTo(new Set());
      void fetchLists();
    }
  }, [open, fetchLists]);

  useEffect(() => {
    if (!open) return;
    setDisplayTitle(title);
    if (title && title !== "Unknown") return;

    const fetchTitle = async () => {
      try {
        const res = await fetch(`/api/v1/tmdb/${mediaType}/${tmdbId}`);
        if (!res.ok) return;
        const data = await res.json();
        const resolvedTitle = mediaType === "movie" ? data.title : data.name;
        if (resolvedTitle) setDisplayTitle(resolvedTitle);
      } catch {
        // ignore
      }
    };

    fetchTitle();
  }, [open, title, mediaType, tmdbId]);

  const handleAddToList = async () => {
    if (!selectedListId || addingTo || addedTo.has(selectedListId)) return;
    const selected = lists.find((list) => list.id === selectedListId);
    if (!selected || selected.alreadyContains) return;

    setAddingTo(selectedListId);
    try {
      const res = await csrfFetch(`/api/v1/lists/${selectedListId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tmdbId, mediaType }),
      });

      if (res.ok) {
        setAddedTo((prev) => new Set(prev).add(selectedListId));
        setLists((prev) =>
          prev.map((l) =>
            l.id === selectedListId ? { ...l, itemCount: l.itemCount + 1, alreadyContains: true } : l
          )
        );
        triggerSocialFeedRefresh();
        void globalMutate((key) =>
          typeof key === "string" && (key === "/api/v1/lists" || key.startsWith("/api/v1/social/feed"))
        );
      } else if (res.status === 409) {
        setLists((prev) =>
          prev.map((l) => (l.id === selectedListId ? { ...l, alreadyContains: true } : l))
        );
      }
    } catch {
      // ignore
    } finally {
      setAddingTo(null);
    }
  };

  const handleListCreated = (list: { id: number; name: string }) => {
    setLists((prev) => [{ ...list, itemCount: 0, alreadyContains: false }, ...prev]);
    setSelectedListId(list.id);
  };

  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;

  return (
    <>
      <Modal open={open} onClose={onClose} title="Add to List">
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-400">
            Add <span className="text-white font-medium">{displayTitle || "Unknown"}</span> to a list
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : lists.length === 0 ? (
            <div className="text-center py-8">
              <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <List className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-400 mb-4">No lists yet</p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create List
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <Select
                value={selectedListId ? String(selectedListId) : undefined}
                onValueChange={(value) => setSelectedListId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a list" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((list) => (
                    <SelectItem
                      key={list.id}
                      value={String(list.id)}
                      disabled={Boolean(list.alreadyContains || addedTo.has(list.id))}
                    >
                      {list.name} ({list.itemCount})
                      {list.alreadyContains || addedTo.has(list.id) ? " • Already added" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedList && (
                <div className="rounded-lg border border-white/10 bg-gray-800/30 px-3 py-2 text-xs text-gray-300">
                  {selectedList.alreadyContains || addedTo.has(selectedList.id)
                    ? "This title is already in the selected list."
                    : `Selected: ${selectedList.name} (${selectedList.itemCount} ${selectedList.itemCount === 1 ? "item" : "items"})`}
                </div>
              )}
            </div>
          )}

          {lists.length > 0 && (
            <button
              onClick={handleAddToList}
              disabled={!selectedListId || addingTo !== null || Boolean(selectedList?.alreadyContains) || (selectedListId !== null && addedTo.has(selectedListId))}
              className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingTo ? "Adding..." : "Add to Selected List"}
            </button>
          )}

          {lists.length > 0 && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 p-3 bg-gray-800/30 hover:bg-gray-800/50 border border-dashed border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create New List
            </button>
          )}
        </div>
      </Modal>

      <CreateListModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleListCreated}
      />
    </>
  );
}
