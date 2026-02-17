"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/Common/Modal";
import { Plus, Lock, Globe } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";

interface CreateListModalProps {
  open: boolean;
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

export function CreateListModal({ open, onClose, onCreated }: CreateListModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mood, setMood] = useState("");
  const [occasion, setOccasion] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

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

      const { list } = await res.json();
      onCreated?.(list);
      toast.success(`List "${list.name}" created successfully`);
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create list";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setMood("");
    setOccasion("");
    setIsPublic(false);
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Create New List">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Name Input */}
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

        {/* Description Input */}
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

        {/* Visibility Toggle */}
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

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-3 bg-gray-800/50 hover:bg-gray-800 text-gray-300 rounded-xl font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
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
    </Modal>
  );
}
