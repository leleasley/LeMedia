"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { TrashIcon, ClockIcon, EyeIcon, ArrowPathIcon, CheckIcon } from "@heroicons/react/24/outline";
import { Dialog, Transition } from "@headlessui/react";

interface MediaShare {
  id: number;
  token: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  createdBy: number;
  createdByUsername: string;
  expiresAt: string | null;
  viewCount: number;
  maxViews: number | null;
  passwordSet: boolean;
  lastViewedAt: string | null;
  lastViewedIp: string | null;
  lastViewedReferrer: string | null;
  lastViewedCountry: string | null;
  lastViewedUaHash: string | null;
  createdAt: string;
  title?: string;
}

export function AdminSharesPageClient() {
  const [shares, setShares] = useState<MediaShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [shareBaseUrl, setShareBaseUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaShare | null>(null);

  const normalizeBaseUrl = (value: string | null | undefined) => {
    if (!value) return null;
    return value.replace(/\/+$/, "");
  };

  const fetchTitlesForShares = useCallback(async (sharesList: MediaShare[]) => {
    setLoadingTitles(true);
    const updatedShares = await Promise.all(
      sharesList.map(async (share) => {
        try {
          const endpoint = share.mediaType === "movie"
            ? `/api/v1/movie/${share.tmdbId}?details=1`
            : `/api/v1/tv/${share.tmdbId}?details=1`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            const title = share.mediaType === "movie"
              ? data.details?.movie?.title
              : data.details?.tv?.name;
            return {
              ...share,
              title: title || `TMDB ID: ${share.tmdbId}`,
            };
          }
        } catch (error) {
          console.error(`Failed to fetch title for ${share.mediaType} ${share.tmdbId}:`, error);
        }
        return { ...share, title: `TMDB ID: ${share.tmdbId}` };
      })
    );
    setShares(updatedShares);
    setLoadingTitles(false);
  }, []);

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shares");
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares);
        setShareBaseUrl(normalizeBaseUrl(data.baseUrl) || window.location.origin);
        // Fetch titles for all shares
        await fetchTitlesForShares(data.shares);
      }
    } catch (error) {
      console.error("Failed to load shares:", error);
    } finally {
      setLoading(false);
    }
  }, [fetchTitlesForShares]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  const getCsrfToken = () => {
    const match = document.cookie.match(/(?:^|; )lemedia_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "";
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      const token = getCsrfToken();
      const res = await fetch(`/api/admin/shares/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": token },
      });
      if (res.ok) {
        setShares(shares.filter((s) => s.id !== id));
        closeDeleteModal();
      } else {
        alert("Failed to delete share link");
      }
    } catch (error) {
      console.error("Failed to delete share:", error);
      alert("Failed to delete share link");
    } finally {
      setDeleting(null);
    }
  };

  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return "Never expires";
    
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return "Expired";
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) <= new Date();
  };

  const copyToClipboard = (id: number) => {
    const origin = normalizeBaseUrl(shareBaseUrl) || window.location.origin;
    const url = `${origin}/share/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(id.toString());
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const openDeleteModal = (share: MediaShare) => {
    setDeleteTarget(share);
    setDeleteConfirm(share.id);
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteConfirm(null);
  };

  const formatLastViewed = (value: string | null) => {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
  };

  const formatReferrer = (value: string | null) => {
    if (!value) return "Direct";
    try {
      return new URL(value).host;
    } catch {
      return "Unknown";
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-8">
        <div className="flex items-center justify-center">
          <ArrowPathIcon className="h-6 w-6 animate-spin text-indigo-500" />
          <span className="ml-3 text-sm text-muted">Loading shares...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Share Links</h2>
            <p className="mt-1 text-sm text-muted">
              Manage all public share links created by users
            </p>
          </div>
          <button
            onClick={loadShares}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
          >
            <ArrowPathIcon className="inline h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>

        {shares.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted">No share links created yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase text-muted">
                  <th className="pb-3 font-medium">Media</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Created By</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Password</th>
                  <th className="pb-3 font-medium">Expires</th>
                  <th className="pb-3 font-medium">Views</th>
                  <th className="pb-3 font-medium">Last Viewed</th>
                  <th className="pb-3 font-medium">Viewer</th>
                  <th className="pb-3 font-medium">IP</th>
                  <th className="pb-3 font-medium">Referrer</th>
                  <th className="pb-3 font-medium">Link</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {shares.map((share) => {
                  const expired = isExpired(share.expiresAt);
                  const isCopied = copiedToken === share.id.toString();
                  return (
                    <tr key={share.id} className={expired ? "opacity-50" : ""}>
                      <td className="py-4">
                        <div className="font-medium text-white max-w-xs">
                          {loadingTitles ? (
                            <span className="text-muted animate-pulse">Loading...</span>
                          ) : (
                            share.title || `TMDB ID: ${share.tmdbId}`
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-white">
                          {share.mediaType}
                        </span>
                      </td>
                      <td className="py-4 text-sm text-muted">
                        {share.createdByUsername}
                      </td>
                      <td className="py-4 text-sm text-muted">
                        {new Date(share.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            share.passwordSet
                              ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                              : "bg-slate-800 text-gray-300 border border-white/10"
                          }`}
                        >
                          {share.passwordSet ? "Set" : "None"}
                        </span>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center text-sm">
                          <ClockIcon className="h-4 w-4 mr-1.5 text-muted" />
                          <span className={expired ? "text-red-400" : "text-muted"}>
                            {getTimeRemaining(share.expiresAt)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center text-sm text-muted">
                          <EyeIcon className="h-4 w-4 mr-1.5" />
                          {share.viewCount}
                          <span className="ml-1.5 text-xs text-gray-500">
                            {share.maxViews ? `/ ${share.maxViews}` : "/ ∞"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 text-sm text-muted">
                        {formatLastViewed(share.lastViewedAt)}
                      </td>
                      <td className="py-4 text-sm text-muted">
                        {share.lastViewedCountry ? share.lastViewedCountry.toUpperCase() : "Unknown"}
                        {share.lastViewedUaHash ? ` • ${share.lastViewedUaHash}` : ""}
                      </td>
                      <td className="py-4 text-sm text-muted">
                        {share.lastViewedIp ?? "Unknown"}
                      </td>
                      <td className="py-4 text-sm text-muted">
                        {formatReferrer(share.lastViewedReferrer)}
                      </td>
                      <td className="py-4">
                        <button
                          onClick={() => copyToClipboard(share.id)}
                          disabled={isCopied}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isCopied
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20"
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <CheckIcon className="h-3.5 w-3.5" />
                              Copied!
                            </>
                          ) : (
                            "Copy Link"
                          )}
                        </button>
                      </td>
                      <td className="py-4">
                        <button
                          onClick={() => openDeleteModal(share)}
                          className="rounded-lg p-2 text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete share link"
                          aria-label="Delete share link"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Transition appear show={Boolean(deleteConfirm && deleteTarget)} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closeDeleteModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-slate-900 border border-white/10 shadow-2xl transition-all">
                  <div className="p-6">
                    <Dialog.Title className="text-lg font-semibold text-white">
                      Delete share link?
                    </Dialog.Title>
                    <Dialog.Description className="mt-2 text-sm text-gray-400">
                      This will permanently remove the share link
                      {deleteTarget?.title ? ` for "${deleteTarget.title}"` : ""}.
                    </Dialog.Description>
                    <div className="mt-6 flex flex-wrap gap-3 justify-end">
                      <button
                        type="button"
                        onClick={closeDeleteModal}
                        disabled={deleting === deleteConfirm}
                        className="rounded-lg bg-slate-800 border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
                        disabled={deleting === deleteConfirm}
                        className="rounded-lg bg-red-600 border border-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                      >
                        {deleting === deleteConfirm ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
