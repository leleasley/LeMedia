"use client";

import { useState, useCallback } from "react";
import {
  CheckSquare,
  Square,
  X,
  Film,
  List,
  Loader2,
} from "lucide-react";

export interface SelectedItem {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
}

interface BulkActionsToolbarProps {
  selectedItems: SelectedItem[];
  onClear: () => void;
  onSelectAll?: () => void;
  totalItems?: number;
  mode?: "requests" | "list";
}

export function BulkActionsToolbar({
  selectedItems,
  onClear,
  onSelectAll,
  totalItems,
  mode = "requests",
}: BulkActionsToolbarProps) {
  const [loading, setLoading] = useState(false);
  const [showListPicker, setShowListPicker] = useState(false);

  const handleBulkRequest = useCallback(async () => {
    if (selectedItems.length === 0 || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/v1/bulk/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: selectedItems.map((item) => ({
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create requests");
      }

      const result = await res.json();
      alert(`Created ${result.created} request(s). ${result.skipped} skipped (already requested).`);
      onClear();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create requests");
    } finally {
      setLoading(false);
    }
  }, [selectedItems, loading, onClear]);

  if (selectedItems.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50">
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-3 border-r border-white/10">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <CheckSquare className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-sm font-medium text-white">
            {selectedItems.length} selected
          </span>
        </div>

        {/* Select all */}
        {onSelectAll && totalItems && totalItems > selectedItems.length && (
          <button
            onClick={onSelectAll}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Square className="w-4 h-4" />
            Select all ({totalItems})
          </button>
        )}

        {/* Actions */}
        {mode === "requests" && (
          <button
            onClick={handleBulkRequest}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Film className="w-4 h-4" />
            )}
            Request All
          </button>
        )}

        {mode === "list" && (
          <button
            onClick={() => setShowListPicker(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all disabled:opacity-50"
          >
            <List className="w-4 h-4" />
            Add to List
          </button>
        )}

        {/* Clear */}
        <button
          onClick={onClear}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
