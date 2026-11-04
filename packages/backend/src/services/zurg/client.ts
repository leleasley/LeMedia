import axios, { type AxiosRequestConfig } from 'axios';
import { getAllServices } from '../../utils/services.js';

/** One acquisition job as reported by zurg's `/acquisition/status.json`. Radarr jobs carry
 *  the Radarr movie id; Sonarr jobs carry `<seriesId>:s<season>:e<first>-<last>`. */
export interface ZurgJob {
  source: string;
  id: string;
  item: string;
  title?: string;
  year?: string;
  state: string; // done | retrying | set aside | running | waiting | queued …
  detail?: string;
  next_retry?: string;
  attempts?: number;
  tries?: number;
  updated_at?: string;
  release?: string;
  quality?: string;
  score?: number;
  placed?: string;
}

export interface ZurgStatus {
  configured?: boolean;
  started?: boolean;
  sources?: { id: string; name?: string; type?: string }[];
  jobs?: ZurgJob[];
}

export interface ZurgConn {
  serviceId: number;
  name: string;
  base: string;
  auth?: { username: string; password: string };
}

export function connFromConfig(config: Record<string, string>, serviceId = 0, name = 'Zurg'): ZurgConn | null {
  const base = (config.url ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return null;
  const username = (config.username ?? '').trim();
  const password = config.password ?? '';
  return { serviceId, name, base, auth: username ? { username, password } : undefined };
}

/** The first enabled Zurg service, or null when none is configured. */
export async function getZurgConn(): Promise<ZurgConn | null> {
  const [svc] = await getAllServices('zurg');
  return svc ? connFromConfig(svc.config, svc.id, svc.name) : null;
}

function reqConfig(conn: ZurgConn, timeout: number, extra: AxiosRequestConfig = {}): AxiosRequestConfig {
  return { timeout, auth: conn.auth, validateStatus: (s) => s >= 200 && s < 300, ...extra };
}

export async function zurgGet<T>(conn: ZurgConn, path: string, timeout = 10_000): Promise<T> {
  const { data } = await axios.get<T>(`${conn.base}${path}`, reqConfig(conn, timeout));
  return data;
}

export async function zurgPost<T>(conn: ZurgConn, path: string, body: unknown = {}, timeout = 15_000): Promise<T> {
  const { data } = await axios.post<T>(`${conn.base}${path}`, body, reqConfig(conn, timeout));
  return data;
}

export function getZurgStatus(conn: ZurgConn): Promise<ZurgStatus> {
  return zurgGet<ZurgStatus>(conn, '/acquisition/status.json', 15_000);
}

/** Does a placement still exist in the library? A depth-0 PROPFIND on zurg's WebDAV view of
 *  `__magic__` answers from zurg's own listing (no provider call): 207 = there, 404 = gone.
 *  Null when zurg can't be asked, so callers can tell "missing" from "unknown". */
export async function zurgPlacedExists(conn: ZurgConn, placed: string): Promise<boolean | null> {
  const path = placed.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  try {
    const res = await axios.request({
      method: 'PROPFIND',
      url: `${conn.base}/dav/__magic__/${path}`,
      headers: { Depth: '0' },
      timeout: 10_000,
      auth: conn.auth,
      validateStatus: () => true,
      responseType: 'text',
      maxContentLength: 256 * 1024,
    });
    if (res.status === 207 || res.status === 200) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

/** Parse a job id into the *arr record it belongs to. */
export function parseJobTarget(job: ZurgJob):
  | { kind: 'movie'; radarrId: number }
  | { kind: 'tv'; sonarrId: number; season: number; firstEp: number | null; lastEp: number | null }
  | null {
  if (job.source.startsWith('radarr:')) {
    const id = Number.parseInt(job.id, 10);
    return Number.isFinite(id) && id > 0 ? { kind: 'movie', radarrId: id } : null;
  }
  if (job.source.startsWith('sonarr:')) {
    const m = /^(\d+):s(\d+)(?::e(\d+)(?:-(\d+))?)?/i.exec(job.id);
    if (!m) return null;
    const first = m[3] ? Number(m[3]) : null;
    return { kind: 'tv', sonarrId: Number(m[1]), season: Number(m[2]), firstEp: first, lastEp: m[4] ? Number(m[4]) : first };
  }
  return null;
}
