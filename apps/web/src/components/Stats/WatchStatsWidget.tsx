"use client";

import { useEffect, useState } from "react";
import { Film, Tv, TrendingUp, Clock } from "lucide-react";
import useSWR from "swr";

type WatchStats = {
  totalMoviesWatched: number;
  totalEpisodesWatched: number;
  totalHoursWatched: number;
  recentMovies: Array<{
    title: string;
    watchedAt: string;
  }>;
  recentEpisodes: Array<{
    title: string;
    episode: string;
    watchedAt: string;
  }>;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
};

export function WatchStatsWidget() {
  const { data, isLoading } = useSWR<WatchStats>("/api/stats/watch", fetcher, {
    refreshInterval: 300000, // Refresh every 5 minutes
    revalidateOnFocus: true
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl glass-strong p-6 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-32 mb-4"></div>
        <div className="grid grid-cols-3 gap-4">
          <div className="h-20 bg-white/5 rounded"></div>
          <div className="h-20 bg-white/5 rounded"></div>
          <div className="h-20 bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-2xl glass-strong p-6">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        Your Watch Stats
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 p-4 border border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Film className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{data.totalMoviesWatched}</p>
              <p className="text-xs text-white/60">Movies Watched</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 p-4 border border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Tv className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{data.totalEpisodesWatched}</p>
              <p className="text-xs text-white/60">Episodes Watched</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 p-4 border border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Clock className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{Math.round(data.totalHoursWatched)}</p>
              <p className="text-xs text-white/60">Hours Watched</p>
            </div>
          </div>
        </div>
      </div>

      {(data.recentMovies.length > 0 || data.recentEpisodes.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/80">Recently Watched</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {data.recentMovies.slice(0, 3).map((movie, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm bg-white/5 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-blue-400" />
                  <span className="text-white/90">{movie.title}</span>
                </div>
                <span className="text-white/50 text-xs">
                  {new Date(movie.watchedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
            {data.recentEpisodes.slice(0, 3).map((ep, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm bg-white/5 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <Tv className="h-4 w-4 text-purple-400" />
                  <span className="text-white/90">{ep.title} - {ep.episode}</span>
                </div>
                <span className="text-white/50 text-xs">
                  {new Date(ep.watchedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
