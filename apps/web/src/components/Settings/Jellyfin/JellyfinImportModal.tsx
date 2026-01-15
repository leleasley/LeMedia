"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Common/Modal";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { getAvatarAlt, getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";

type JellyfinUser = {
  id: string;
  username: string;
  avatarUrl: string;
};

type JellyfinImportModalProps = {
  open: boolean;
  onClose: () => void;
  onComplete: (userIds: number[]) => void;
};

export function JellyfinImportModal({ open, onClose, onComplete }: JellyfinImportModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [users, setUsers] = useState<JellyfinUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/v1/admin/jellyfin/users", { credentials: "include" })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Failed to load Jellyfin users");
        }
        return res.json();
      })
      .then(payload => {
        setUsers(payload.users ?? []);
        setSelected(new Set());
      })
      .catch(err => {
        const msg = err?.message ?? "Failed to load Jellyfin users";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const allSelected = useMemo(() => users.length > 0 && selected.size === users.length, [users, selected]);

  const toggleUser = (userId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map(user => user.id)));
    }
  };

  const handleImport = async () => {
    if (!selected.size) return;
    setImporting(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/v1/admin/jellyfin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jellyfinUserIds: Array.from(selected) })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to import users");
      }
      const created = Array.isArray(body.createdUserIds) ? body.createdUserIds : [];
      const linked = Array.isArray(body.linkedUserIds) ? body.linkedUserIds : [];
      const total = created.length + linked.length;
      toast.success(total ? `${total} user${total === 1 ? "" : "s"} synced` : "No users were synced");
      onComplete([...created, ...linked]);
      onClose();
    } catch (err: any) {
      const msg = err?.message ?? "Failed to import users";
      setError(msg);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} title="Import Jellyfin users" onClose={onClose}>
      {loading ? <div className="py-6 text-sm text-muted">Loading users…</div> : null}
      {error ? (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <button type="button" className="btn btn-sm btn-ghost text-xs" onClick={toggleAll}>
              {allSelected ? "Clear selection" : "Select all"}
            </button>
            <span>{selected.size} selected</span>
          </div>
          {users.length ? (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {users.map(user => {
                const avatarSrc = getAvatarSrc({ avatarUrl: user.avatarUrl, username: user.username });
                const avatarAlt = getAvatarAlt({ username: user.username });

                return (
                  <label
                    key={user.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-white/10">
                        <Image
                          src={avatarSrc}
                          alt={avatarAlt}
                          fill
                          className="object-cover"
                          unoptimized={shouldBypassNextImage(avatarSrc)}
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-white">{user.username}</div>
                        <div className="text-[0.6rem] text-muted">Jellyfin ID {user.id}</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={selected.has(user.id)}
                      onChange={() => toggleUser(user.id)}
                    />
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 p-4 text-xs text-muted">
              No Jellyfin users found to import.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-sm btn-ghost text-xs" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary text-xs"
              disabled={!selected.size || importing}
              onClick={handleImport}
            >
              {importing ? "Importing…" : "Import selected"}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
