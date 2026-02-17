"use client";

import { useState, useCallback } from "react";
import {
  CheckSquare,
  Square,
  X,
  Check,
  XCircle,
  Loader2,
} from "lucide-react";

interface AdminBulkActionsToolbarProps {
  selectedRequestIds: string[];
  onClear: () => void;
  onSelectAll?: () => void;
  totalItems?: number;
  onActionComplete?: () => void;
}

export function AdminBulkActionsToolbar({
  selectedRequestIds,
  onClear,
  onSelectAll,
  totalItems,
  onActionComplete,
}: AdminBulkActionsToolbarProps) {
  const [loading, setLoading] = useState<"approve" | "deny" | null>(null);
  const [showDenyReason, setShowDenyReason] = useState(false);
  const [denyReason, setDenyReason] = useState("");

  const handleBulkAction = useCallback(
    async (action: "approve" | "deny") => {
      if (selectedRequestIds.length === 0 || loading) return;

      if (action === "deny" && !showDenyReason) {
        setShowDenyReason(true);
        return;
      }

      setLoading(action);
      try {
        const res = await fetch("/api/v1/admin/bulk/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            requestIds: selectedRequestIds,
            action,
            reason: action === "deny" ? denyReason || undefined : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to process requests");
        }

        const result = await res.json();
        alert(
          `${result.action === "approve" ? "Approved" : "Denied"} ${result.updated} request(s).`
        );
        onClear();
        onActionComplete?.();
        setShowDenyReason(false);
        setDenyReason("");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to process requests");
      } finally {
        setLoading(null);
      }
    },
    [selectedRequestIds, loading, denyReason, showDenyReason, onClear, onActionComplete]
  );

  if (selectedRequestIds.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col gap-3">
        {/* Deny reason input */}
        {showDenyReason && (
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
            <input
              type="text"
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Reason for denial (optional)"
              className="flex-1 px-3 py-2 bg-gray-800 border border-white/10 rounded-lg text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
              autoFocus
            />
            <button
              onClick={() => handleBulkAction("deny")}
              disabled={loading === "deny"}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading === "deny" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Confirm Deny"
              )}
            </button>
            <button
              onClick={() => {
                setShowDenyReason(false);
                setDenyReason("");
              }}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50">
          {/* Selection count */}
          <div className="flex items-center gap-2 pr-3 border-r border-white/10">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <CheckSquare className="w-4 h-4 text-blue-400" />
            </div>
            <span className="text-sm font-medium text-white">
              {selectedRequestIds.length} selected
            </span>
          </div>

          {/* Select all */}
          {onSelectAll && totalItems && totalItems > selectedRequestIds.length && (
            <button
              onClick={onSelectAll}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <Square className="w-4 h-4" />
              Select all ({totalItems})
            </button>
          )}

          {/* Actions */}
          <button
            onClick={() => handleBulkAction("approve")}
            disabled={loading !== null}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-medium transition-all disabled:opacity-50"
          >
            {loading === "approve" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Approve All
          </button>

          <button
            onClick={() => handleBulkAction("deny")}
            disabled={loading !== null}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-lg font-medium transition-all disabled:opacity-50"
          >
            {loading === "deny" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            Deny All
          </button>

          {/* Clear */}
          <button
            onClick={() => {
              onClear();
              setShowDenyReason(false);
              setDenyReason("");
            }}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
