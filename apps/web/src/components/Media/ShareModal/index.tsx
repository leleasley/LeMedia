"use client";

import { useState, Fragment } from "react";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import { X, Share2, Copy, Check, Clock, ChevronDown } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";

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

export function ShareModal({ isOpen, onClose, mediaType, tmdbId, title }: ShareModalProps) {
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
      const res = await csrfFetch("/api/share/create", {
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl" />
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
              <Dialog.Panel className="relative w-full max-w-sm">
                {/* Animated gradient border glow */}
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-60 blur-sm animate-pulse" />
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-30" />
                
                {/* Main modal container */}
                <div className="relative w-full rounded-2xl bg-gradient-to-b from-gray-900/95 via-gray-900/98 to-gray-950 border border-white/10 shadow-[0_0_50px_rgba(99,102,241,0.15)] backdrop-blur-2xl overflow-hidden">
                  {/* Header */}
                  <div className="relative px-5 py-5">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5" />
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="absolute inset-0 rounded-xl bg-indigo-500 opacity-20 blur-lg" />
                          <div className="relative rounded-xl p-2.5 bg-indigo-500/10 border border-indigo-500/20">
                            <Share2 className="h-5 w-5 text-indigo-400" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Share</h3>
                          <p className="text-sm text-gray-400 line-clamp-1">{title}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleClose}
                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Modal Content */}
                  <div className="p-5 space-y-4">
                    {!shareUrl ? (
                      <>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-purple-400" />
                            <Clock className="h-4 w-4" />
                            Link Expiration
                          </label>
                          <Listbox value={expiration} onChange={setExpiration}>
                            <div className="relative">
                              <Listbox.Button className="relative w-full cursor-pointer rounded-xl bg-white/5 border border-white/10 py-3 pl-4 pr-10 text-left text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
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
                                <Listbox.Options className="absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-xl bg-gray-900 border border-white/10 py-1 shadow-2xl focus:outline-none">
                                  {EXPIRATION_OPTIONS.map((option) => (
                                    <Listbox.Option
                                      key={option.value}
                                      value={option}
                                      className={({ active }) =>
                                        `relative cursor-pointer select-none py-3 px-4 transition-colors ${
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

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-purple-400" />
                            Password <span className="text-gray-500 font-normal">(optional)</span>
                          </label>
                          <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Leave blank for no password"
                            autoComplete="new-password"
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 focus:bg-white/[0.07] transition-all duration-200"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-purple-400" />
                            Max Views <span className="text-gray-500 font-normal">(optional)</span>
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={maxViews}
                            onChange={(event) => setMaxViews(event.target.value)}
                            placeholder="Leave blank for unlimited"
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 focus:bg-white/[0.07] transition-all duration-200"
                          />
                        </div>

                        <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4">
                          <p className="text-sm text-gray-400 leading-relaxed">
                            Create a shareable link to this {mediaType === "movie" ? "movie" : "TV show"}. 
                            Recipients can view details without an account.
                          </p>
                        </div>

                        <button
                          onClick={handleCreateShare}
                          disabled={isCreating}
                          className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 px-4 py-3 font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-indigo-500/25"
                        >
                          {isCreating ? "Creating..." : "Create Share Link"}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 flex items-center gap-3">
                          <div className="rounded-lg p-2 bg-green-500/20">
                            <Check className="h-4 w-4 text-green-400" />
                          </div>
                          <p className="text-sm text-green-400 font-medium">
                            Share link created successfully!
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-green-400 to-emerald-400" />
                            Share Link
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={shareUrl}
                              readOnly
                              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-sm focus:outline-none"
                            />
                            <button
                              onClick={handleCopy}
                              className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
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
                          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 font-medium text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                        >
                          Done
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
