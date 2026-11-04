import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

export type ItemType = 'movie' | 'show';

export interface ListItem {
  key: string;
  mediaType: ItemType;
  title: string;
  year: number;
  ids: { tmdb?: number | string; tvdb?: number | string; imdb?: string };
  overview: string;
  genres: string[];
  originalLanguage: string;
  feeds: string[];
  existing?: boolean;
  blocked?: boolean;
  blockReason?: string;
}

export interface Preview {
  id: string;
  source: { url: string; label: string; provider: string; providerName: string; mediaType: ItemType | 'mixed'; resolver: string };
  items: ListItem[];
  counts: { total: number; existing: number; missing: number; blocked: number };
  arrMissing: ItemType[];
}

export interface AddSettings {
  search: boolean;
  onlyNew?: boolean;
  radarrProfileId?: number;
  radarrRoot?: string;
  sonarrProfileId?: number;
  sonarrRoot?: string;
}

export interface AddResult {
  requested: number;
  added: { key: string; title: string; service: string }[];
  skipped: { key: string; title: string; reason: string; blocked?: boolean }[];
  failed: { key: string; title: string; error: string }[];
}

export interface Job {
  id: string;
  kind: 'preview' | 'add' | 'sync' | 'retry';
  label: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  progress?: { done: number; total: number; phase: string };
  result?: unknown;
  error?: string;
}

export interface ArrChoice { profiles: { id: number; name: string }[]; roots: { path: string; accessible: boolean }[] }
export interface ArrChoices { movie: ArrChoice | null; show: ArrChoice | null }

export type FilterKey = 'foreign' | 'anime' | 'kids' | 'gameShows' | 'talkShows' | 'reality' | 'documentary';
export interface ListsSettings {
  filters: { rules: Record<FilterKey, { movie: boolean; tv: boolean }>; allowedLanguages: string[] };
  syncIntervalHours: number;
  defaults: Partial<AddSettings>;
  traktClientIdSet: boolean;
  mdblistApiKeySet: boolean;
}

/** Follow one background job until it finishes. */
export function useJob(jobId: string | null, onDone?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const cb = useRef(onDone);
  cb.current = onDone;
  useEffect(() => {
    setJob(null);
    if (!jobId) return;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      try {
        const { data } = await api.get<Job>(`/admin/lists/jobs/${jobId}`);
        if (stop) return;
        setJob(data);
        if (data.status !== 'running') { cb.current?.(data); return; }
      } catch { /* restarting or a blip: keep polling */ }
      if (!stop) timer = window.setTimeout(tick, 1500);
    };
    void tick();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [jobId]);
  return job;
}

export function useArrChoices() {
  const [choices, setChoices] = useState<ArrChoices | null>(null);
  const load = useCallback(async () => {
    try { const { data } = await api.get<ArrChoices>('/admin/lists/arr'); setChoices(data); } catch { setChoices({ movie: null, show: null }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return choices;
}

export const typeLabel = (t: ItemType | 'mixed') => (t === 'movie' ? 'Movies' : t === 'show' ? 'TV' : 'Movies and TV');

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))} min`;
    if (f < 86400) return `in ${Math.round(f / 3600)} h`;
    return `in ${Math.round(f / 86400)} d`;
  }
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
