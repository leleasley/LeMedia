"use client";

import { useState, Fragment } from "react";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import { X, Share2, Copy, Check, Clock, ChevronDown } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import Image from "next/image";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  backdropPath: string | null;
  posterUrl?: string | null;
}

const EXPIRATION_OPTIONS = [
  { value: "1h", label: "1 Hour" },
  { value: "24h", label: "24 Hours" },
  { value: "48h", label: "48 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "never", label: "Never Expires" },
] as const;

export function ShareModal({ isOpen, onClose, mediaType, tmdbId, title, backdropPath, posterUrl }: ShareModalProps) {
  const [expiration, setExpiration] = useState(EXPIRATION_OPTIONS[1]); // Default to 24h
  const [isCreating, setIsCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [maxViews, setMaxViews] = useState("");
  const toast = useToast();

  const handleCreateShare = async () => {
    const trimmedMaxViews = maxViews.trim();
    let parsedMaxViews: number | null = null;
    if (trimmedMaxViews) {
      const value = Number(trimmedMaxViews);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Max views must be a positive number.");
        return;
      }
      parsedMaxViews = value;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          tmdbId,
          expiresIn: expiration.value,
          password: password.trim() || null,
          maxViews: parsedMaxViews ? Math.floor(parsedMaxViews) : null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create share");
      }

      const data = await res.json();
      setShareUrl(data.url);
      toast.success("Share link created!");
    } catch (error: any) {
      toast.error(error.message || "Failed to create share link");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setShareUrl(null);
    setCopied(false);
    setExpiration(EXPIRATION_OPTIONS[1]);
    setPassword("");
    setMaxViews("");
    onClose();
  };

  const imageUrl = posterUrl || (backdropPath ? `https://image.tmdb.org/t/p/w500${backdropPath}` : null);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-slate-900 border border-white/10 shadow-2xl transition-all">
                {/* Header with Image */}
                <div className="relative h-64 overflow-hidden">
                  {imageUrl ? (
                    <>
                      <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        className="object-cover"
                        priority
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-slate-900/40" />
                    </>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                  )}
                  <div className="absolute inset-0 flex flex-col justify-between p-6">
                    <div className="flex justify-end">
                      <button
                        onClick={handleClose}
                        className="rounded-full p-2 bg-black/50 hover:bg-black/70 text-white transition-colors backdrop-blur-sm"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-indigo-400 mb-2">
                        <Share2 className="h-5 w-5" />
                        <span className="text-sm font-medium">Share</span>
                      </div>
                      <h3 className="text-2xl font-bold text-white drop-shadow-lg">{title}</h3>
                    </div>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="p-6 space-y-4">
                  {!shareUrl ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-3">
                          <Clock className="inline h-4 w-4 mr-1.5" />
                          Link Expiration
                        </label>
                        <Listbox value={expiration} onChange={setExpiration}>
                          <div className="relative">
                            <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-slate-800 border border-gray-700 py-3 pl-4 pr-10 text-left text-white hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                              <span className="block truncate">{expiration.label}</span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                <ChevronDown className="h-5 w-5 text-gray-400" aria-hidden="true" />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-lg bg-slate-800 border border-gray-700 py-1 shadow-2xl focus:outline-none">
                                {EXPIRATION_OPTIONS.map((option) => (
                                  <Listbox.Option
                                    key={option.value}
                                    value={option}
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none py-3 px-4 ${
                                        active ? 'bg-indigo-600 text-white' : 'text-gray-200'
                                      }`
                                    }
                                  >
                                    {({ selected }) => (
                                      <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
                                        {option.label}
                                      </span>
                                    )}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-3">
                          Optional Password
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Leave blank for no password"
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-gray-700 bg-slate-800 px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                        <p className="mt-2 text-xs text-gray-400">
                          Add a password for extra protection. Leave blank to keep it open.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-3">
                          Expire After Views
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={maxViews}
                          onChange={(event) => setMaxViews(event.target.value)}
                          placeholder="Leave blank for unlimited"
                          className="w-full rounded-lg border border-gray-700 bg-slate-800 px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                        <p className="mt-2 text-xs text-gray-400">
                          Limit how many times this link can be viewed before it expires.
                        </p>
                      </div>

                      <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
                        <p className="text-sm text-gray-400">
                          Create a shareable link to this {mediaType === "movie" ? "movie" : "TV show"}. 
                          Recipients can view details without needing an account.
                        </p>
                      </div>

                      <button
                        onClick={handleCreateShare}
                        disabled={isCreating}
                        className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
                      >
                        {isCreating ? "Creating..." : "Create Share Link"}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                        <p className="text-sm text-green-400 font-medium">
                          ✓ Share link created successfully!
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Share Link
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            className="flex-1 rounded-lg border border-gray-700 bg-slate-800 px-4 py-3 text-white text-sm focus:outline-none"
                          />
                          <button
                            onClick={handleCopy}
                            className="rounded-lg bg-slate-800 border border-gray-700 px-4 py-3 text-white hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
                            aria-label="Copy share link"
                          >
                            {copied ? (
                              <Check className="h-5 w-5 text-green-400" />
                            ) : (
                              <Copy className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleClose}
                        className="w-full rounded-lg bg-slate-800 border border-gray-700 px-4 py-3 font-medium text-white hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
                      >
                        Done
                      </button>
                    </>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
