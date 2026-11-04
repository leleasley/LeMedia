import { useState, useEffect } from 'react';
import api from '@/lib/api';

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

/** Merged movie+TV provider list, deduped by id. Cached in-module for the session —
 *  the server caches it a week, and logos only change when TMDB adds a service. */
let cache: WatchProvider[] | null = null;
let inFlight: Promise<WatchProvider[]> | null = null;

async function loadProviders(): Promise<WatchProvider[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [movies, tv] = await Promise.all([
        api.get('/tmdb/watch/providers/movie'),
        api.get('/tmdb/watch/providers/tv'),
      ]);
      const seen = new Map<number, WatchProvider>();
      for (const p of [...(tv.data ?? []), ...(movies.data ?? [])] as WatchProvider[]) {
        if (!seen.has(p.provider_id)) seen.set(p.provider_id, p);
      }
      cache = [...seen.values()];
    } catch {
      cache = [];
    } finally {
      inFlight = null;
    }
    return cache;
  })();
  return inFlight;
}

export function useWatchProviders() {
  const [providers, setProviders] = useState<WatchProvider[]>(() => cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    loadProviders().then((list) => {
      if (!cancelled) {
        setProviders(list);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return { providers, loading };
}
