"use client";

import { useEffect, useState } from "react";
import { ArrowDownTrayIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { Loader2 } from "lucide-react";

interface DownloadProgressBarProps {
  type: "movie" | "tv";
  tmdbId: number;
  onComplete?: () => void;
}

interface DownloadData {
  status: string;
  percentComplete: number;
  timeleft: string | null;
  isImporting?: boolean;
  errorMessage?: string;
  size: number;
  sizeleft: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatTimeLeft(timeleft: string | null): string {
  if (!timeleft) return 'Calculating...';
  
  // Parse ISO 8601 duration format (PT1H30M45S)
  const match = timeleft.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return timeleft;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

export function DownloadProgressBar({ type, tmdbId, onComplete }: DownloadProgressBarProps) {
  const [download, setDownload] = useState<DownloadData | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false);

  useEffect(() => {
    if (!isPolling) return;

    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/downloads/progress?type=${type}&tmdbId=${tmdbId}`);
        if (!res.ok) {
          setDownload(null);
          setIsPolling(false);
          return;
        }

        const data = await res.json();
        const downloads = data.downloads || [];

        if (downloads.length > 0) {
          const dl = downloads[0];
          setDownload(dl);

          // If download is complete and was importing, mark as complete
          if (dl.isImporting && dl.percentComplete >= 99 && !hasCompletedOnce) {
            setHasCompletedOnce(true);
            setTimeout(() => {
              setIsPolling(false);
              onComplete?.();
            }, 3000); // Show "Importing..." for 3 seconds then callback
          } else if (dl.percentComplete >= 100 && !dl.isImporting && !hasCompletedOnce) {
            setHasCompletedOnce(true);
            setTimeout(() => {
              setIsPolling(false);
              onComplete?.();
            }, 2000);
          }
        } else {
          // No downloads found
          if (hasCompletedOnce) {
            setIsPolling(false);
            return;
          }
          setDownload(null);
        }
      } catch (error) {
        console.error("[Download Progress] Fetch error:", error);
      }
    };

    // Initial fetch
    fetchProgress();

    // Poll every 5 seconds
    const interval = setInterval(fetchProgress, 5000);

    return () => clearInterval(interval);
  }, [type, tmdbId, isPolling, hasCompletedOnce, onComplete]);

  if (!download) {
    return null;
  }

  const { status, percentComplete, timeleft, isImporting, errorMessage, size, sizeleft } = download;

  // Error state
  if (errorMessage) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
        <div className="flex items-center gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-red-200">Download Error</div>
            <div className="text-xs text-red-300/70 mt-0.5 truncate">{errorMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  // Importing state
  if (isImporting) {
    return (
      <div className="rounded-xl glass-strong border border-purple-500/30 p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-purple-400 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-purple-200">Importing to Library</div>
            <div className="text-xs text-purple-300/70 mt-0.5">Processing files...</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-purple-950/50 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full animate-pulse" style={{ width: '100%' }} />
        </div>
      </div>
    );
  }

  // Downloading state
  const downloaded = size - sizeleft;
  const downloadedStr = formatBytes(downloaded);
  const totalStr = formatBytes(size);
  const timeLeftStr = formatTimeLeft(timeleft);

  return (
    <div className="rounded-xl glass-strong border border-blue-500/30 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative">
            <ArrowDownTrayIcon className="w-5 h-5 text-blue-400" />
            <div className="absolute -right-1 -bottom-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-blue-200">Downloading</div>
            <div className="text-xs text-blue-300/70 mt-0.5">{downloadedStr} of {totalStr}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-lg font-bold text-blue-400">{Math.round(percentComplete)}%</div>
          <div className="text-xs text-blue-300/60">{timeLeftStr}</div>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="relative h-2 bg-blue-950/50 rounded-full overflow-hidden">
        <div 
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(percentComplete, 100)}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
