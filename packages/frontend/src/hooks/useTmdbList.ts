import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';

interface UseTmdbListOptions {
  skip?: boolean;
  transform?: (data: any) => any[];
}

interface UseTmdbListResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTmdbList<T = any>(
  endpoint: string | null,
  key: string = '',
  options: UseTmdbListOptions = {}
): UseTmdbListResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(!options.skip && !!endpoint);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const loadedRequest = useRef<string | null>(null);
  const requestKey = JSON.stringify([endpoint, key]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!endpoint || optionsRef.current.skip) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(endpoint, { signal });
      if (signal?.aborted) return;
      const raw = res.data;
      // Defensive: a proxy/Cloudflare error page arrives as an HTML string — never pass it to
      // a transform that expects {results, total_results}. Guard so a bad response can never
      // crash a row (r.map is not a function) or leak characters into image URLs.
      if (optionsRef.current.transform) {
        // When a transform is provided, let it handle the data shape — the endpoint may
        // return an array (e.g. /media/recent) or an object with .results. Only block
        // obviously invalid responses (null, undefined, HTML strings).
        if (!raw || (typeof raw !== 'object' && typeof raw !== 'string')) {
          setData([]);
          loadedRequest.current = requestKey;
          return;
        }
        // Guard against HTML error pages from Cloudflare/proxy
        if (typeof raw === 'string' && raw.trimStart().startsWith('<')) {
          setData([]);
          loadedRequest.current = requestKey;
          return;
        }
        try {
          const out = optionsRef.current.transform(raw);
          setData((Array.isArray(out) ? out : []) as T[]);
        } catch {
          setData([] as T[]);
        }
        loadedRequest.current = requestKey;
        return;
      }
      const base: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object'
          ? ((raw as Record<string, unknown>).results as unknown[] || (raw as Record<string, unknown>).cast as unknown[] || [])
          : [];
      setData((Array.isArray(base) ? base : []) as T[]);
      loadedRequest.current = requestKey;
    } catch (err: any) {
      if (err.name === 'CanceledError' || signal?.aborted) return;
      setError(err.message || 'Failed to fetch');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [endpoint, requestKey]);

  useEffect(() => {
    // Activity resumes effects on Back, while the successful list and its DOM survive.
    if (loadedRequest.current === requestKey) return;
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData, requestKey]);

  const refetch = useCallback(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch };
}
