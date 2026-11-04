import { Film, Radar, Tv, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

export type ArrApp = 'sonarr' | 'radarr' | 'prowlarr';
export type LibApp = 'sonarr' | 'radarr';

export const APP_META: Record<ArrApp, { name: string; icon: LucideIcon; tone: string; ring: string }> = {
  sonarr: { name: 'Sonarr', icon: Tv, tone: 'bg-sky-500/15 text-sky-300', ring: 'ring-sky-400/30' },
  radarr: { name: 'Radarr', icon: Film, tone: 'bg-amber-500/15 text-amber-300', ring: 'ring-amber-400/30' },
  prowlarr: { name: 'Prowlarr', icon: Radar, tone: 'bg-orange-500/15 text-orange-300', ring: 'ring-orange-400/30' },
};

export interface AppOverview {
  app: ArrApp; name: string; configured: boolean; online?: boolean; error?: string; link?: string;
  version?: string; branch?: string; docker?: boolean; packageVersion?: string | null; startTime?: string | null; instanceName?: string;
  update?: {
    available: boolean; latest: { version: string; releaseDate: string } | null; behind: number;
    changes: { version: string; releaseDate: string; new: string[]; fixed: string[] }[];
    imageTag: string | null; imageReady: boolean | null; blocker?: string | null;
  };
  health?: { type: string; source: string; message: string; wikiUrl: string | null }[];
  disks?: { path: string; label: string | null; free: number; total: number }[];
  counts?: { items?: number; missing?: number; queue?: number; indexers?: number; enabledIndexers?: number } | null;
  container?: { image?: string; status?: string; startedAt?: string; health?: string | null; restartCount?: number } | null;
  auto?: { enabled: boolean; utcHour: number; last: { at: string; result: string } | null };
  previous?: { image: string; version: string; at: string } | null;
}

export interface ArrJob { id: string; app: ArrApp; kind: 'restart' | 'update'; status: 'running' | 'done' | 'failed'; phase: string; error?: string }

export const bytes = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(2)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);

export function ago(iso: string | null | undefined) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function uptime(iso: string | null | undefined) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** Poll a restart/update job until it ends. */
export function useArrJob(id: string | null, onDone: (j: ArrJob) => void) {
  const [job, setJob] = useState<ArrJob | null>(null);
  const cb = useRef(onDone);
  cb.current = onDone;
  useEffect(() => {
    setJob(null);
    if (!id) return;
    let stop = false;
    let t = 0;
    const tick = async () => {
      try {
        const { data } = await api.get<ArrJob>(`/admin/arr/jobs/${id}`);
        if (stop) return;
        setJob(data);
        if (data.status !== 'running') { cb.current(data); return; }
      } catch { /* LeMedia or the app restarting: keep trying */ }
      if (!stop) t = window.setTimeout(tick, 2500);
    };
    void tick();
    return () => { stop = true; window.clearTimeout(t); };
  }, [id]);
  return job;
}
