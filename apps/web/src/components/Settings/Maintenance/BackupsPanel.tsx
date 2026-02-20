"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { ConfirmModal, useConfirm } from "@/components/Common/ConfirmModal";

const VALIDATION_STORAGE_KEY = "lemedia:backup-validations";

type BackupSummary = {
  name: string;
  sizeBytes: number;
  createdAt: string;
};

type BackupResponse = {
  backups: BackupSummary[];
  maxFiles: number;
};

const fetcher = (url: string) => fetch(url, { cache: "no-store", credentials: "include" }).then((res) => res.json());

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function BackupsPanel() {
  const toast = useToast();
  const { confirm, modalProps } = useConfirm();
  const [creating, setCreating] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [validationResult, setValidationResultRaw] = useState<Record<string, "valid" | "invalid">>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem(VALIDATION_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const setValidationResult: typeof setValidationResultRaw = useCallback((action) => {
    setValidationResultRaw((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      try { localStorage.setItem(VALIDATION_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const { data, mutate, isLoading } = useSWR<BackupResponse>("/api/v1/admin/settings/backups", fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  });

  const backups = useMemo(() => data?.backups ?? [], [data]);
  const maxFiles = data?.maxFiles ?? 5;

  // Prune validation results for backups that no longer exist
  useEffect(() => {
    if (!data) return;
    const names = new Set(data.backups.map((b) => b.name));
    setValidationResult((prev) => {
      const pruned = Object.fromEntries(
        Object.entries(prev).filter(([key]) => names.has(key))
      ) as Record<string, "valid" | "invalid">;
      if (Object.keys(pruned).length === Object.keys(prev).length) return prev;
      return pruned;
    });
  }, [data, setValidationResult]);

  async function createBackup() {
    setCreating(true);
    try {
      const res = await csrfFetch("/api/v1/admin/settings/backups", {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to create backup");
      }
      toast.success(`Backup created: ${body?.backup?.name ?? "archive"}`);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  }

  async function validateBackup(name: string) {
    setValidating(name);
    try {
      const res = await csrfFetch(`/api/v1/admin/settings/backups/${encodeURIComponent(name)}/validate`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body?.error || "Validation failed";
        setValidationResult((prev) => ({ ...prev, [name]: "invalid" }));
        toast.error(`Validation failed for ${name}: ${message}`);
        return;
      }
      setValidationResult((prev) => ({ ...prev, [name]: "valid" }));
      toast.success(`Validated ${name}`);
    } finally {
      setValidating(null);
    }
  }

  return (
    <div className="space-y-5">
      <ConfirmModal {...modalProps} />
      {/* Create backup + storage info row */}
      <div className="glass-strong rounded-2xl md:rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        <div className="p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 flex-shrink-0 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                  <path d="M3 12A9 3 0 0 0 21 12" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Backups</h3>
                <p className="text-sm text-white/50 mt-0.5">
                  Zipped database + Redis snapshots stored on the server
                </p>
              </div>
            </div>
            <button
              onClick={createBackup}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/30 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none sm:flex-shrink-0"
            >
              {creating ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  Create Backup
                </>
              )}
            </button>
          </div>
        </div>

        {/* Storage info strip */}
        <div className="border-t border-white/5 bg-white/[0.02] px-5 md:px-6 py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-white/40">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>Storage: <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-white/60 font-mono">BACKUP_DIR</code></span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Retention:</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: maxFiles }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 w-2 rounded-full transition-colors ${
                      i < backups.length
                        ? "bg-amber-400/80"
                        : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-white/50 font-medium">{backups.length}/{maxFiles}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Backup archives list */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-1">Archives</h4>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 rounded bg-white/5" />
                    <div className="h-3 w-32 rounded bg-white/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : backups.length === 0 ? (
          <div className="glass-strong rounded-2xl border border-white/10 p-8 md:p-12 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 ring-1 ring-white/10 mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/20">
                <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" />
                <path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
                <path d="M4 12H2" />
                <path d="M10 12H8" />
                <path d="M16 12h-2" />
                <path d="M22 12h-2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-white/50">No backups yet</p>
            <p className="text-xs text-white/30 mt-1">Create your first backup to protect your data</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((backup, index) => (
              <div
                key={backup.name}
                className="group glass-strong rounded-2xl border border-white/10 p-4 transition-all hover:border-white/15"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 ring-1 transition-colors ${
                      validationResult[backup.name] === "valid"
                        ? "bg-emerald-500/10 ring-emerald-500/20"
                        : validationResult[backup.name] === "invalid"
                        ? "bg-red-500/10 ring-red-500/20"
                        : "bg-white/5 ring-white/10"
                    }`}>
                      {validationResult[backup.name] === "valid" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                          <path d="m9 12 2 2 4-4" />
                        </svg>
                      ) : validationResult[backup.name] === "invalid" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                          <path d="m14.5 9.5-5 5" />
                          <path d="m9.5 9.5 5 5" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
                          <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" />
                          <path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
                          <path d="M4 12H2" />
                          <path d="M10 12H8" />
                          <path d="M16 12h-2" />
                          <path d="M22 12h-2" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">{backup.name}</span>
                        {index === 0 && (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
                            Latest
                          </span>
                        )}
                        {validationResult[backup.name] === "valid" && (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                            Verified
                          </span>
                        )}
                        {validationResult[backup.name] === "invalid" && (
                          <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 ring-1 ring-red-500/20">
                            Invalid
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-white/40">
                        <span>{formatSize(backup.sizeBytes)}</span>
                        <span className="text-white/15">·</span>
                        <span title={new Date(backup.createdAt).toLocaleString()}>{timeAgo(backup.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                    {validationResult[backup.name] !== "valid" && (
                      <button
                        onClick={() => validateBackup(backup.name)}
                        disabled={validating === backup.name}
                        title="Validate archive integrity"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white hover:border-white/20 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {validating === backup.name ? (
                          <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                          </svg>
                        )}
                        <span className="hidden sm:inline">{validating === backup.name ? "Checking..." : "Validate"}</span>
                      </button>
                    )}
                    <a
                      href={`/api/v1/admin/settings/backups/${encodeURIComponent(backup.name)}/download`}
                      title="Download backup"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20 transition-all hover:bg-emerald-600/30 hover:text-emerald-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" x2="12" y1="15" y2="3" />
                      </svg>
                      <span className="hidden sm:inline">Download</span>
                    </a>
                    <button
                      onClick={async () => {
                        const ok = await confirm(`Delete backup "${backup.name}"?`, {
                          title: "Delete Backup",
                          destructive: true,
                          confirmLabel: "Delete",
                        });
                        if (!ok) return;
                        setDeleting(backup.name);
                        try {
                          const res = await csrfFetch(`/api/v1/admin/settings/backups/${encodeURIComponent(backup.name)}`, {
                            method: "DELETE",
                          });
                          const body = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            throw new Error(body?.error || "Failed to delete backup");
                          }
                          toast.success(`Deleted ${backup.name}`);
                          setValidationResult((prev) => {
                            const next = { ...prev };
                            delete next[backup.name];
                            return next;
                          });
                          mutate();
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Failed to delete backup");
                        } finally {
                          setDeleting(null);
                        }
                      }}
                      disabled={deleting === backup.name}
                      title="Delete backup"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/10 px-3 py-1.5 text-xs font-medium text-red-400/70 ring-1 ring-red-500/10 transition-all hover:bg-red-600/20 hover:text-red-400 hover:ring-red-500/20 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {deleting === backup.name ? (
                        <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      )}
                      <span className="hidden sm:inline">{deleting === backup.name ? "Deleting..." : "Delete"}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
