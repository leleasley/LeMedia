"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

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

export function BackupsPanel() {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<Record<string, string>>({});

  const { data, mutate, isLoading } = useSWR<BackupResponse>("/api/v1/admin/settings/backups", fetcher, {
    refreshInterval: 20000,
    revalidateOnFocus: true,
  });

  const backups = useMemo(() => data?.backups ?? [], [data]);

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
        setValidationResult((prev) => ({ ...prev, [name]: `Invalid: ${message}` }));
        toast.error(`Validation failed for ${name}`);
        return;
      }
      setValidationResult((prev) => ({ ...prev, [name]: "Valid backup archive" }));
      toast.success(`Validated ${name}`);
    } finally {
      setValidating(null);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Backups</h3>
          <p className="text-sm text-gray-400">
            Create zipped database + Redis backups and store them on the server.
          </p>
        </div>
        <button
          onClick={createBackup}
          disabled={creating}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {creating ? "Creating..." : "Create Backup (.zip)"}
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs uppercase tracking-wider text-gray-400">Storage</p>
        <p className="mt-1 text-sm text-gray-300">
          Backups are written to <code className="rounded bg-black/30 px-1 py-0.5">BACKUP_DIR</code> (default:
          <code className="rounded bg-black/30 px-1 py-0.5 ml-1">/data/backups</code>).
        </p>
        <p className="mt-1 text-sm text-gray-300">
          Retention keeps the newest <code className="rounded bg-black/30 px-1 py-0.5">{data?.maxFiles ?? 5}</code> backups.
        </p>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-white uppercase tracking-wide">Archives</h4>
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading backups...</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-gray-400">No backups found yet.</p>
        ) : (
          backups.map((backup) => (
            <div
              key={backup.name}
              className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="text-sm font-semibold text-white">{backup.name}</div>
                <div className="text-xs text-gray-400">
                  {formatSize(backup.sizeBytes)} • {new Date(backup.createdAt).toLocaleString()}
                </div>
                {validationResult[backup.name] ? (
                  <div className="mt-1 text-xs text-emerald-300">{validationResult[backup.name]}</div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => validateBackup(backup.name)}
                  disabled={validating === backup.name}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  {validating === backup.name ? "Validating..." : "Validate"}
                </button>
                <a
                  href={`/api/v1/admin/settings/backups/${encodeURIComponent(backup.name)}/download`}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Download
                </a>
                <button
                  onClick={async () => {
                    const confirmed = window.confirm(`Delete backup ${backup.name}?`);
                    if (!confirmed) return;
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
                  className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
                >
                  {deleting === backup.name ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
