"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Share2, Check, Globe, Star, Film, Tv, ArrowRight } from "lucide-react";

interface ListItem {
  id: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterUrl: string | null;
  year: string;
  rating: number;
  description: string;
}

interface SharedListPageClientProps {
  list: {
    id: number;
    name: string;
    description: string | null;
    itemCount: number;
    createdAt: string;
    coverTmdbId?: number | null;
    coverMediaType?: "movie" | "tv" | null;
    customCoverImagePath?: string | null;
    updatedAt?: string | null;
    mood?: string | null;
    occasion?: string | null;
  };
  items: ListItem[];
}

export function SharedListPageClient({ list, items }: SharedListPageClientProps) {
  const [copied, setCopied] = useState(false);

  const copyShareLink = async () => {
    if (typeof window === "undefined") return;
    const shareUrl = window.location.href;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine cover image
  const coverItem = useMemo(() => {
    if (list.coverTmdbId && list.coverMediaType) {
      const match = items.find(i => i.tmdbId === list.coverTmdbId && i.mediaType === list.coverMediaType);
      if (match?.posterUrl) return match;
    }
    return items.find(i => i.posterUrl);
  }, [items, list.coverTmdbId, list.coverMediaType]);

  const customCoverUrl = useMemo(() => {
    if (!list.customCoverImagePath) return null;
    const query = list.updatedAt ? `?v=${encodeURIComponent(list.updatedAt)}` : "";
    return `/api/v1/lists/${list.id}/cover/image${query}`;
  }, [list.customCoverImagePath, list.id, list.updatedAt]);

  const heroCoverUrl = customCoverUrl || coverItem?.posterUrl || null;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-white selection:bg-blue-500/30">
      {/* Hero Header */}
      <div className="relative w-full overflow-hidden border-b border-white/5">
        {heroCoverUrl && (
          <div className="absolute inset-0 z-0">
            <Image
              src={heroCoverUrl}
              alt=""
              fill
              className="object-cover opacity-[0.15] blur-3xl scale-110 select-none"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0f19]/60 to-[#0b0f19]" />
          </div>
        )}
        
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-8 pt-8 pb-8">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-md text-blue-400 text-xs font-medium">
                  <Globe className="w-3 h-3" />
                  Shared List
                </div>
                <span className="text-gray-600 text-xs">•</span>
                <span className="text-gray-400 text-xs">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                <span className="text-gray-600 text-xs">•</span>
                <span className="text-gray-400 text-xs">{new Date(list.createdAt).toLocaleDateString()}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                {list.name}
              </h1>
              
              {list.description && (
                <p className="text-base text-gray-400 leading-relaxed max-w-2xl">
                  {list.description}
                </p>
              )}

              {(list.mood || list.occasion) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {list.mood && (
                    <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-400">
                      {list.mood}
                    </span>
                  )}
                  {list.occasion && (
                    <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-400">
                      {list.occasion}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-start lg:pt-7">
              <button
                onClick={copyShareLink}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors border border-white/10"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                {copied ? "Copied" : "Share"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 pb-20">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-gray-500/10 blur-2xl rounded-full" />
              <div className="relative bg-gray-900 border border-white/10 p-6 rounded-3xl">
                <Film className="w-10 h-10 text-gray-500" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">No items yet</h3>
            <p className="text-base text-gray-400 max-w-md mb-8 leading-relaxed">
              The owner hasn&apos;t added any movies or TV shows to this list yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {items.map((item) => (
              <div key={item.id} className="group relative bg-[#131720] rounded-xl overflow-hidden shadow-sm hover:shadow-xl hover:shadow-blue-900/10 transition-all hover:-translate-y-1 duration-300">
                <div className="aspect-[2/3] relative w-full overflow-hidden bg-gray-800">
                  {item.posterUrl ? (
                    <Image
                       src={item.posterUrl}
                       alt={item.title}
                       fill
                       className="object-cover transition-transform duration-500 group-hover:scale-105"
                       sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-800 text-gray-500">
                      {item.mediaType === 'movie' ? <Film className="h-8 w-8 opacity-20" /> : <Tv className="h-8 w-8 opacity-20" />}
                    </div>
                  )}
                  
                  {/* Rating Label */}
                  {item.rating > 0 && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-white flex items-center gap-1">
                      <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />
                      {item.rating.toFixed(1)}
                    </div>
                  )}
                </div>

                <div className="p-3">
                  <h3 className="font-medium text-white text-sm line-clamp-1 group-hover:text-blue-400 transition-colors" title={item.title}>
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span>{item.year || 'Unknown'}</span>
                    <span className="w-0.5 h-0.5 rounded-full bg-gray-600" />
                    <span className="capitalize">{item.mediaType === 'movie' ? 'Movie' : 'TV Show'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA Footer */}
      <div className="border-t border-white/5 bg-[#020617]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
          <div className="relative overflow-hidden rounded-3xl bg-blue-600/10 border border-blue-500/20 p-8 sm:p-12">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500/20 blur-3xl rounded-full" />
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-purple-500/20 blur-3xl rounded-full" />
            
            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-8">
              <div className="text-center sm:text-left">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                  Create your own lists
                </h2>
                <p className="text-blue-200/80 max-w-md">
                  Join LeMedia to discover, track, and share your favorite movies and TV shows with friends.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] whitespace-nowrap"
              >
                Get Started
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Powered by <span className="text-white font-medium">LeMedia</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
