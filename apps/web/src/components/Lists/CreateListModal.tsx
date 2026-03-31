"use client";

import { useState } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { Plus, Lock, Globe, X, Check } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { mutate as globalMutate } from "swr";
import { triggerSocialFeedRefresh } from "@/lib/social-feed-refresh";
import { createPortal } from "react-dom";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

interface CreateListModalProps {
  onClose: () => void;
  onCreated?: (list: {
    id: number;
    name: string;
    shareId: string;
    shareSlug?: string | null;
    mood?: string | null;
    occasion?: string | null;
    isPublic?: boolean;
  }) => void;
}

/**
 * This component should only be mounted when the modal should be visible.
 * Parent controls visibility via conditional rendering:
 *   {showModal && <CreateListModal onClose={...} onCreated={...} />}
 */
export function CreateListModal({ onClose, onCreated }: CreateListModalProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mood, setMood] = useState("");
  const [occasion, setOccasion] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLockBodyScroll(true);

  const close = () => {
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading || isSuccess) return;

    setLoading(true);
    setError(null);

    try {
      const res = await csrfFetch("/api/v1/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          mood: mood.trim() || undefined,
          occasion: occasion.trim() || undefined,
          isPublic,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create list");
      }

      const raw = await res.json();
      const payload = raw?.data ?? raw;
      const list = payload?.list;
      if (!list?.id || !list?.name) {
        throw new Error("Failed to create list");
      }

      // Show success state
      setLoading(false);
      setIsSuccess(true);
      toast.success(`List "${list.name}" created successfully`);
      
      triggerSocialFeedRefresh();
      void globalMutate((key) =>
        typeof key === "string" && (key === "/api/v1/lists" || key.startsWith("/api/v1/social/feed"))
      );

      // Delay closing so user sees the tick
      setTimeout(() => {
        try {
          onCreated?.(list);
        } finally {
          close();
        }
      }, 700);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create list";
      setError(message);
      setLoading(false);
      toast.error(message);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xl p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-label="Create New List"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) close();
      }}
    >
      <div className="relative w-full sm:max-w-xl animate-in fade-in slide-in-from-bottom-6 sm:zoom-in-95 duration-300">
        <div className="absolute -inset-[1px] rounded-t-3xl sm:rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-60 blur-sm animate-pulse" />
        <div className="absolute -inset-[1px] rounded-t-3xl sm:rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-30" />

        <div
          className="relative w-full rounded-t-3xl sm:rounded-3xl bg-gradient-to-b from-gray-900/95 via-gray-900/98 to-gray-950 border-t sm:border border-white/10 shadow-[0_0_50px_rgba(99,102,241,0.15)] overflow-hidden max-h-[85vh] sm:max-h-[90vh] backdrop-blur-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-5">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="relative flex items-center justify-between gap-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">Create New List</h2>
              <button
                type="button"
                className="group flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                onClick={close}
                aria-label="Close"
              >
                <X className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="relative px-5 sm:px-6 pb-5 sm:pb-6 overflow-y-auto max-h-[calc(85vh-80px)] sm:max-h-[calc(90vh-80px)]">
            <div className="text-sm text-gray-300">
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <label htmlFor="list-name" className="block text-sm font-medium text-gray-300 mb-2">
                    List Name
                  </label>
                  <input
                    id="list-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Awesome List"
                    maxLength={100}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor="list-description" className="block text-sm font-medium text-gray-300 mb-2">
                    Description <span className="text-gray-500">(optional)</span>
                  </label>
                  <textarea
                    id="list-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this list about?"
                    maxLength={500}
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="list-mood" className="block text-sm font-medium text-gray-300 mb-2">
                      Mood <span className="text-gray-500">(optional)</span>
                    </label>
                    <input
                      id="list-mood"
                      type="text"
                      value={mood}
                      onChange={(e) => setMood(e.target.value)}
                      placeholder="Cozy, intense, uplifting"
                      maxLength={80}
                      className="w-full px-4 py-3 bg-gray-800/50 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor="list-occasion" className="block text-sm font-medium text-gray-300 mb-2">
                      Occasion <span className="text-gray-500">(optional)</span>
                    </label>
                    <input
                      id="list-occasion"
                      type="text"
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value)}
                      placeholder="Weekend, date night"
                      maxLength={80}
                      className="w-full px-4 py-3 bg-gray-800/50 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3">
                    {isPublic ? (
                      <div className="p-2 rounded-lg bg-green-500/20">
                        <Globe className="w-5 h-5 text-green-400" />
                      </div>
                    ) : (
                      <div className="p-2 rounded-lg bg-gray-500/20">
                        <Lock className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">
                        {isPublic ? "Public List" : "Private List"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isPublic
                          ? "Anyone with the link can view"
                          : "Only you can see this list"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPublic(!isPublic)}
                    className={`relative w-12 h-7 rounded-full transition-colors overflow-hidden ${
                      isPublic ? "bg-green-500" : "bg-gray-600"
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                        isPublic ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 px-4 py-3 bg-gray-800/50 hover:bg-gray-800 text-gray-300 rounded-xl font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!name.trim() || loading || isSuccess}
                    className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      isSuccess
                        ? "bg-green-500 hover:bg-green-400 text-white"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white"
                    }`}
                  >
                    {isSuccess ? (
                      <>
                        <Check className="w-5 h-5" />
                        Created!
                      </>
                    ) : loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Create List
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
