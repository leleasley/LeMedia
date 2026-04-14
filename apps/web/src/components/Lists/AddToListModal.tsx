"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/Common/Modal";
import { Check, List, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { CreateListModal } from "./CreateListModal";
import { csrfFetch } from "@/lib/csrf-client";
import { mutate as globalMutate } from "swr";
import { triggerSocialFeedRefresh } from "@/lib/social-feed-refresh";
import { useToast } from "@/components/Providers/ToastProvider";

interface CustomList {
  id: number;
  name: string;
  itemCount: number;
  canEdit?: boolean;
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
  const toast = useToast();
  const [lists, setLists] = useState<CustomList[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [addedTo, setAddedTo] = useState<Set<number>>(new Set());
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/lists?tmdbId=${tmdbId}&mediaType=${mediaType}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const containing = new Set<number>((data.containingListIds ?? []).map((id: number) => Number(id)));
        const nextLists = (data.lists || [])
          .filter((list: CustomList) => list.canEdit !== false)
          .map((list: CustomList) => ({
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
      setAddedTo(new Set());
      setSearchQuery("");
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

  const handleAddToList = async (list: CustomList) => {
    if (addingTo || addedTo.has(list.id) || list.alreadyContains) return;

    setAddingTo(list.id);
    try {
      const res = await csrfFetch(`/api/v1/lists/${list.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tmdbId, mediaType }),
      });

      if (res.ok) {
        setAddedTo((prev) => new Set(prev).add(list.id));
        setLists((prev) =>
          prev.map((l) =>
            l.id === list.id ? { ...l, itemCount: l.itemCount + 1, alreadyContains: true } : l
          )
        );
        toast.success(`Added to ${list.name}`);
        triggerSocialFeedRefresh();
        void globalMutate((key) =>
          typeof key === "string" && (key === "/api/v1/lists" || key.startsWith("/api/v1/social/feed"))
        );
      } else if (res.status === 409) {
        setLists((prev) =>
          prev.map((l) => (l.id === list.id ? { ...l, alreadyContains: true } : l))
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
    setCreateModalOpen(false);
    toast.success(`List \"${list.name}\" created`);
    void handleAddToList({ id: list.id, name: list.name, itemCount: 0, alreadyContains: false });
  };

  const visibleLists = lists
    .filter((list) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return list.name.toLowerCase().includes(query);
    })
    .sort((left, right) => {
      const leftDisabled = Boolean(left.alreadyContains || addedTo.has(left.id));
      const rightDisabled = Boolean(right.alreadyContains || addedTo.has(right.id));
      if (leftDisabled !== rightDisabled) return leftDisabled ? 1 : -1;
      return left.name.localeCompare(right.name);
    });

  return (
    <>
      <Modal open={open} onClose={onClose} title="Add to List">
        <div className="space-y-4 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-400/15 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-200">
              <Sparkles className="h-3.5 w-3.5" />
              Save To List
            </div>
            <p className="text-sm text-gray-300">
              Add <span className="font-medium text-white">{displayTitle || "Unknown"}</span> to one of your curated lists.
            </p>
          </div>

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
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                <Plus className="w-4 h-4" />
                Create List
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search your lists..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-9 pr-4 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-indigo-400/40 focus:bg-white/[0.06]"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">
                <span>{visibleLists.length} {visibleLists.length === 1 ? "list" : "lists"} ready</span>
                <span>Tap once to add</span>
              </div>

              <div className="max-h-[18rem] space-y-2 overflow-y-auto pr-1">
                {visibleLists.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/55">
                    No lists match that search yet.
                  </div>
                ) : (
                  visibleLists.map((list) => {
                    const disabled = Boolean(list.alreadyContains || addedTo.has(list.id));
                    const isSaving = addingTo === list.id;
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => !disabled && !isSaving && void handleAddToList(list)}
                        disabled={disabled || isSaving}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                          disabled
                            ? "border-emerald-400/20 bg-emerald-500/[0.08] opacity-70"
                            : isSaving
                              ? "border-indigo-400/35 bg-indigo-500/[0.10]"
                              : "border-white/10 bg-white/[0.04] hover:border-indigo-400/35 hover:bg-white/[0.07]"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{list.name}</div>
                          <div className="mt-1 text-xs text-white/45">
                            {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                            {disabled ? " • Already added" : " • Add now"}
                          </div>
                        </div>
                        <div className={`inline-flex min-w-[4.75rem] flex-shrink-0 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          disabled
                            ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                            : isSaving
                              ? "border-indigo-300/30 bg-indigo-400/15 text-indigo-100"
                              : "border-white/10 bg-white/[0.04] text-white/75"
                        }`}>
                          {disabled ? (
                            <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Added</span>
                          ) : isSaving ? (
                            <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding</span>
                          ) : (
                            <span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {lists.length > 0 && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-gray-400 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <Plus className="w-4 h-4" />
              Create New List
            </button>
          )}
        </div>
      </Modal>

      {createModalOpen && (
        <CreateListModal
          onClose={() => setCreateModalOpen(false)}
          onCreated={handleListCreated}
        />
      )}
    </>
  );
}
