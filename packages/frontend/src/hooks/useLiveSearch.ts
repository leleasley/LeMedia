import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { TmdbMedia } from '@/types';

export type LiveSearchItem = TmdbMedia & { media_type: string };
export interface LiveSearchPerson { id: number; name: string; profile_path: string | null; known_for_department: string | null }

/** Debounced as-you-type search (titles + notable people). Aborts the in-flight request on
 *  each keystroke; rides the 1h server-side search cache. */
export function useLiveSearch(query: string, delay = 250) {
  const [items, setItems] = useState<LiveSearchItem[]>([]);
  const [people, setPeople] = useState<LiveSearchPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [settledQuery, setSettledQuery] = useState('');
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) {
      setItems([]);
      setPeople([]);
      setLoading(false);
      setSettledQuery('');
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/tmdb/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const arr = Array.isArray(data) ? data : data?.results;
        setItems(Array.isArray(arr) ? (arr as LiveSearchItem[]).filter((r) => r.media_type === 'movie' || r.media_type === 'tv') : []);
        const ppl = data?.people;
        setPeople(Array.isArray(ppl) ? (ppl as LiveSearchPerson[]).filter((p) => p && typeof p.id === 'number') : []);
        setSettledQuery(q);
        setLoading(false);
      } catch {
        // Aborted keystroke (a newer request owns `loading`) or transient failure.
        if (!controller.signal.aborted) setLoading(false);
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, delay]);

  return { items, people, loading, settledQuery };
}
