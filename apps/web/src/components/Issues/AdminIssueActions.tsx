"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { csrfFetch } from "@/lib/csrf-client";

type Props = {
  issueId: string;
  status: string;
};

export function AdminIssueActions({ issueId, status }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const markResolved = async () => {
    setError(null);
    const res = await csrfFetch(`/api/v1/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
      credentials: "include"
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error || "Failed to update issue");
      return;
    }
    startTransition(() => router.refresh());
  };

  const deleteIssue = async () => {
    setError(null);
    if (!window.confirm("Delete this issue? This cannot be undone.")) return;
    const res = await csrfFetch(`/api/v1/issues/${issueId}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error || "Failed to delete issue");
      return;
    }
    startTransition(() => router.refresh());
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={markResolved}
          disabled={isPending || status === "resolved"}
          className="rounded-md border border-emerald-400/50 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark fixed
        </button>
        <button
          type="button"
          onClick={deleteIssue}
          disabled={isPending}
          className="rounded-md border border-rose-400/50 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-300 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}
