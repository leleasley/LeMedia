"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/Common/Modal";
import { Plus, Check, List, Loader2 } from "lucide-react";
import { CreateListModal } from "./CreateListModal";
import { csrfFetch } from "@/lib/csrf-client";

interface CustomList {
  id: number;
  name: string;
  itemCount: number;
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);

  useEffect(() => {
    if (open) {
      fetchLists();
    }
  }, [open]);

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

  const fetchLists = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/lists", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLists(data.lists || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleAddToList = async (listId: number) => {
    if (addingTo || addedTo.has(listId)) return;

    setAddingTo(listId);
    try {
      const res = await csrfFetch(`/api/v1/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tmdbId, mediaType }),
      });

      if (res.ok) {
        setAddedTo((prev) => new Set(prev).add(listId));
        setLists((prev) =>
          prev.map((l) =>
            l.id === listId ? { ...l, itemCount: l.itemCount + 1 } : l
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setAddingTo(null);
    }
  };

  const handleListCreated = (list: { id: number; name: string }) => {
    setLists((prev) => [{ ...list, itemCount: 0 }, ...prev]);
  };

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
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {lists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => handleAddToList(list.id)}
                  disabled={addingTo === list.id || addedTo.has(list.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                    addedTo.has(list.id)
                      ? "bg-green-500/20 border border-green-500/30"
                      : "bg-gray-800/50 hover:bg-gray-800 border border-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        addedTo.has(list.id) ? "bg-green-500/20" : "bg-white/5"
                      }`}
                    >
                      {addedTo.has(list.id) ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : (
                        <List className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-white">{list.name}</p>
                      <p className="text-xs text-gray-500">
                        {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>
                  </div>
                  {addingTo === list.id && (
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  )}
                  {addedTo.has(list.id) && (
                    <span className="text-xs text-green-400 font-medium">Added</span>
                  )}
                </button>
              ))}
            </div>
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
