"use client";

import Image from "next/image";
import useSWR from "swr";
import { formatDate } from "@/lib/dateFormat";

type RequestItem = {
  id: string;
  title: string;
  request_type: string;
  status: string;
  created_at: string;
  posterUrl?: string | null;
  tmdb_id: number;
};

interface DownloadProgress {
  id: number;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  status: string;
  sizeleft: number;
  size: number;
  timeleft: string | null;
  estimatedCompletionTime: string | null;
  percentComplete: number;
  downloadId: string;
}

const statusConfig: Record<string, { bg: string; text: string; border: string; glow: string; icon: string }> = {
  available: { 
    bg: "bg-emerald-500/15", 
    text: "text-emerald-300", 
    border: "border-emerald-500/40",
    glow: "shadow-emerald-500/20",
    icon: "✓"
  },
  partially_available: {
    bg: "bg-purple-500/15",
    text: "text-purple-300",
    border: "border-purple-500/40",
    glow: "shadow-purple-500/20",
    icon: "◐"
  },
  downloading: { 
    bg: "bg-amber-500/15", 
    text: "text-amber-300", 
    border: "border-amber-500/40",
    glow: "shadow-amber-500/20",
    icon: "↓"
  },
  submitted: { 
    bg: "bg-blue-500/15", 
    text: "text-blue-300", 
    border: "border-blue-500/40",
    glow: "shadow-blue-500/20",
    icon: "⏳"
  },
  pending: { 
    bg: "bg-sky-500/15", 
    text: "text-sky-300", 
    border: "border-sky-500/40",
    glow: "shadow-sky-500/20",
    icon: "⏳"
  },
  denied: { 
    bg: "bg-red-500/15", 
    text: "text-red-300", 
    border: "border-red-500/40",
    glow: "shadow-red-500/20",
    icon: "✕"
  },
  failed: { 
    bg: "bg-red-500/15", 
    text: "text-red-300", 
    border: "border-red-500/40",
    glow: "shadow-red-500/20",
    icon: "!"
  },
  removed: { 
    bg: "bg-slate-500/15", 
    text: "text-slate-300", 
    border: "border-slate-500/40",
    glow: "shadow-slate-500/20",
    icon: "−"
  },
  already_exists: { 
    bg: "bg-violet-500/15", 
    text: "text-violet-300", 
    border: "border-violet-500/40",
    glow: "shadow-violet-500/20",
    icon: "★"
  }
};

const defaultStatusConfig = { 
  bg: "bg-gray-500/15", 
  text: "text-gray-300", 
  border: "border-gray-500/40",
  glow: "shadow-gray-500/20",
  icon: "•"
};

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

function StatusBadge({ status, download }: { status: string; download?: DownloadProgress }) {
  if (download) {
    return (
      <div className="flex flex-col gap-2 min-w-[140px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-amber-200 text-sm">Downloading</span>
          </div>
          <span className="text-amber-100 font-bold text-sm">{Math.round(download.percentComplete)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden relative">
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500 ease-out rounded-full relative"
            style={{ width: `${download.percentComplete}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>
        {download.timeleft && (
          <div className="text-xs text-amber-200/70 font-medium">
            {download.timeleft === "00:00:00" ? "✨ Finishing up..." : `${download.timeleft} remaining`}
          </div>
        )}
      </div>
    );
  }

  const config = statusConfig[status] ?? defaultStatusConfig;
  return (
    <span className={`
      inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold 
      border backdrop-blur-sm transition-all duration-300
      ${config.bg} ${config.text} ${config.border}
      hover:scale-105 shadow-lg ${config.glow}
    `}>
      <span className="text-[10px]">{config.icon}</span>
      {formatStatusLabel(status)}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isMovie = type === 'movie';
  const isTv = type === 'tv' || type === 'episode';
  
  return (
    <span className={`
      inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider
      ${isMovie ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 
        isTv ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 
        'bg-gray-500/20 text-gray-300 border border-gray-500/30'}
    `}>
      {isMovie ? '🎬' : isTv ? '📺' : '📁'} {type}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-6 border border-white/10">
        <span className="text-4xl">🎬</span>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">No requests yet</h3>
      <p className="text-sm text-white/50 max-w-xs">
        Start exploring and request your favorite movies and TV shows!
      </p>
    </div>
  );
}

export function RequestsPageClient({ initialRequests }: { initialRequests: RequestItem[] }) {
  const { data } = useSWR<{ requests: RequestItem[] }>("/api/v1/requests/me", {
    refreshInterval: 15000,
    fallbackData: { requests: initialRequests },
    revalidateOnFocus: true,
  });

  const { data: downloadData } = useSWR<{ downloads: DownloadProgress[] }>("/api/downloads/progress", {
    refreshInterval: 2000,
    revalidateOnFocus: true,
  });

  const requests = data?.requests ?? initialRequests;
  const downloads = downloadData?.downloads ?? [];

  const getDownload = (req: RequestItem) => {
    const type = req.request_type === 'episode' ? 'tv' : req.request_type;
    return downloads.find(d => d.tmdbId === req.tmdb_id && d.type === type);
  };

  const stats = {
    total: requests.length,
    available: requests.filter(r => r.status === 'available').length,
    partiallyAvailable: requests.filter(r => r.status === 'partially_available').length,
    pending: requests.filter(r => ['submitted', 'pending', 'downloading'].includes(r.status)).length,
  };

  return (
    <div className="space-y-6 px-4 md:px-8 pb-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="relative">
        <div className="absolute -top-4 -left-4 w-32 h-32 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <p className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-1">Personal Library</p>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            My Requests
          </h1>
          
          {/* Stats Bar */}
          {requests.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <span className="text-white/70 text-sm">Total</span>
                <span className="font-bold text-white">{stats.total}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-emerald-300/70 text-sm">Available</span>
                <span className="font-bold text-emerald-300">{stats.available}</span>
              </div>
              {stats.partiallyAvailable > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20">
                  <span className="text-purple-300/70 text-sm">Partial</span>
                  <span className="font-bold text-purple-300">{stats.partiallyAvailable}</span>
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                <span className="text-amber-300/70 text-sm">In Progress</span>
                <span className="font-bold text-amber-300">{stats.pending}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        {requests.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Mobile View - Card Grid */}
            <div className="md:hidden p-4 space-y-4">
              {requests.map((r, index) => {
                const download = getDownload(r);
                return (
                  <div 
                    key={r.id} 
                    className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Gradient accent on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 to-purple-500/0 group-hover:from-indigo-500/5 group-hover:to-purple-500/5 transition-all duration-500" />
                    
                    <div className="relative flex gap-4 p-4">
                      {/* Poster */}
                      <div className="relative w-20 h-28 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 shadow-lg group-hover:shadow-xl transition-shadow duration-300">
                        {r.posterUrl ? (
                          <Image 
                            src={r.posterUrl} 
                            alt={r.title} 
                            fill 
                            className="object-cover transition-transform duration-500 group-hover:scale-110" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                        )}
                        {/* Poster shine effect */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                        <div>
                          <h3 className="font-bold text-base text-white leading-tight line-clamp-2 mb-2 group-hover:text-indigo-100 transition-colors">
                            {r.title}
                          </h3>
                          <TypeBadge type={r.request_type} />
                        </div>
                        
                        <div className="mt-3 space-y-2">
                          <StatusBadge status={r.status} download={download} />
                          {!download && (
                            <p className="text-xs text-white/40 font-medium">
                              📅 {formatDate(r.created_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View - Enhanced Table */}
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="p-5 pl-6 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Media</th>
                    <th className="p-5 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Title</th>
                    <th className="p-5 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Type</th>
                    <th className="p-5 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Status</th>
                    <th className="p-5 pr-6 text-right text-xs font-bold text-white/50 uppercase tracking-wider">Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r, index) => {
                    const download = getDownload(r);
                    return (
                      <tr 
                        key={r.id} 
                        className="group border-b border-white/5 last:border-b-0 hover:bg-gradient-to-r hover:from-indigo-500/5 hover:to-purple-500/5 transition-all duration-300"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <td className="p-4 pl-6">
                          <div className="relative w-14 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 shadow-lg group-hover:shadow-xl group-hover:shadow-indigo-500/20 transition-all duration-300 ring-1 ring-white/10 group-hover:ring-indigo-500/30">
                            {r.posterUrl ? (
                              <Image 
                                src={r.posterUrl} 
                                alt={r.title} 
                                fill 
                                className="object-cover transition-transform duration-500 group-hover:scale-110" 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-white text-lg group-hover:text-indigo-100 transition-colors line-clamp-1">
                            {r.title}
                          </div>
                        </td>
                        <td className="p-4">
                          <TypeBadge type={r.request_type} />
                        </td>
                        <td className="p-4">
                          <StatusBadge status={r.status} download={download} />
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <span className="text-sm text-white/40 font-medium">
                            {formatDate(r.created_at)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
