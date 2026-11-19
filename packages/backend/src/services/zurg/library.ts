import axios from 'axios';
import { getZurgConn, type ZurgConn } from './client.js';

/**
 * What Zurg actually holds for one series, season by season.
 *
 * Zurg's layout is not uniform: some shows are `tv/<Show>/Season NN/episode.mkv`, some are flat
 * `tv/<Show>/<Show> S02E05.mkv`, and a release Zurg could not parse stays at the mount root as
 * `__magic__/<release name>/Season NN/…`. All three are read here, because the point of the
 * inventory is to show what the *arr does not have — and that is usually the messy ones.
 *
 * Read per show (not a background sweep) and cached by the caller.
 */

export interface ZurgSeason {
  season: number;
  /** Episode numbers parsed from file names; empty when they could not be read. */
  episodes: number[];
  files: number;
}

const TIMEOUT_MS = 30_000;
const MAX_SEASON_DIRS = 60;

function basicAuth(conn: ZurgConn): Record<string, string> {
  if (!conn.auth) return {};
  return { Authorization: 'Basic ' + Buffer.from(`${conn.auth.username}:${conn.auth.password}`).toString('base64') };
}

interface DavEntry { name: string; path: string; isDir: boolean }

async function propfind(conn: ZurgConn, path: string): Promise<DavEntry[]> {
  const encoded = path.split('/').map((s) => (s ? encodeURIComponent(s) : s)).join('/');
  const { data } = await axios.request<string>({
    method: 'PROPFIND',
    url: `${conn.base}${encoded}`,
    headers: { Depth: '1', ...basicAuth(conn) },
    timeout: TIMEOUT_MS,
    responseType: 'text',
    maxContentLength: 8 * 1024 * 1024,
    validateStatus: (s) => s === 207 || s === 200,
  });
  const out: DavEntry[] = [];
  const self = path.replace(/\/+$/, '');
  for (const match of data.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)) {
    const block = match[1];
    const href = /<d:href>([^<]+)<\/d:href>/.exec(block)?.[1] ?? '';
    const decoded = decodeURIComponent(href);
    const name = decoded.replace(/\/+$/, '').split('/').pop() ?? '';
    if (!name || decoded.replace(/\/+$/, '') === self) continue;
    out.push({ name, path: decoded, isDir: block.includes('<d:collection/>') });
  }
  return out;
}

const normalise = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** `S02E05` / `2x05` → season + episode. Null when the name has no season+episode pair. */
function parseEpisode(fileName: string): { season: number; episode: number } | null {
  const s = fileName.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i);
  if (s) return { season: Number(s[1]), episode: Number(s[2]) };
  const x = fileName.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (x) return { season: Number(x[1]), episode: Number(x[2]) };
  return null;
}

function addEpisodes(target: Map<number, Set<number>>, counts: Map<number, number>, files: DavEntry[], seasonHint?: number) {
  for (const file of files) {
    if (file.isDir) continue;
    const parsed = parseEpisode(file.name);
    const season = parsed?.season ?? seasonHint;
    if (season === undefined) continue;
    if (!target.has(season)) target.set(season, new Set());
    if (parsed) target.get(season)!.add(parsed.episode);
    counts.set(season, (counts.get(season) ?? 0) + 1);
  }
}

/** The show's own folder under `__magic__/tv`, matched by title when the row predates the scan. */
async function showFolder(conn: ZurgConn, title: string, zurgPath?: string | null): Promise<string | null> {
  if (zurgPath && zurgPath.includes('/tv/')) return zurgPath;
  const folders = (await propfind(conn, '/dav/__magic__/tv').catch(() => [])).filter((f) => f.isDir);
  const wanted = normalise(title);
  const exact = folders.find((f) => normalise(f.name) === wanted);
  if (exact) return exact.path;
  const withoutYear = folders.find((f) => normalise(f.name).replace(/\s+\d{4}$/, '') === wanted);
  return withoutYear?.path ?? null;
}

/** Releases Zurg could not sort into `tv/<Show>` sit at the mount root, named after the release. */
async function unsortedFolders(conn: ZurgConn, title: string): Promise<DavEntry[]> {
  const wanted = normalise(title);
  if (!wanted) return [];
  const root = await propfind(conn, '/dav/__magic__').catch(() => []);
  return root.filter((entry) => {
    if (!entry.isDir) return false;
    const name = normalise(entry.name);
    return name !== 'movies' && name !== 'tv' && name.startsWith(wanted);
  });
}

/** Season folders and flat files under one container (a show folder or an unsorted release). */
async function readContainer(conn: ZurgConn, path: string, seasons: Map<number, Set<number>>, counts: Map<number, number>, depth = 0): Promise<boolean> {
  const children = await propfind(conn, path).catch(() => []);
  if (children.length === 0) return false;

  addEpisodes(seasons, counts, children.filter((c) => !c.isDir));
  const dirs = children.filter((c) => c.isDir);
  const before = seasons.size;

  for (const dir of dirs.slice(0, MAX_SEASON_DIRS)) {
    const named = /season\s*(\d{1,2})/i.exec(dir.name) ?? /^s(\d{1,2})$/i.exec(dir.name);
    const specials = /^specials?$/i.test(dir.name);
    const seasonHint = specials ? 0 : named ? Number(named[1]) : undefined;

    if (seasonHint !== undefined) {
      const files = await propfind(conn, dir.path).catch(() => []);
      addEpisodes(seasons, counts, files, seasonHint);
      // A season folder that only holds release subfolders (e.g. "Season 1/Show.S01.1080p/").
      for (const sub of files.filter((f) => f.isDir).slice(0, 20)) {
        addEpisodes(seasons, counts, await propfind(conn, sub.path).catch(() => []), seasonHint);
      }
    } else if (depth < 2) {
      // An unsorted release nests another folder level before its seasons.
      await readContainer(conn, dir.path, seasons, counts, depth + 1);
    }
  }
  return seasons.size > before || [...seasons.values()].some((set) => set.size > 0);
}

export async function zurgTvInventory(media: { title: string; zurgPath?: string | null }): Promise<{ path: string; seasons: ZurgSeason[] } | null> {
  const conn = await getZurgConn().catch(() => null);
  if (!conn) return null;

  const path = await showFolder(conn, media.title, media.zurgPath);
  const seasons = new Map<number, Set<number>>();
  const counts = new Map<number, number>();
  let used = path ?? '';

  if (path) await readContainer(conn, path, seasons, counts);

  // Nothing under the show's own folder: the release may still be sitting unsorted at the root.
  if (seasons.size === 0) {
    for (const entry of await unsortedFolders(conn, media.title)) {
      if (await readContainer(conn, entry.path, seasons, counts)) { used = entry.path; break; }
    }
  }

  if (!used && seasons.size === 0) return null;
  const result: ZurgSeason[] = [...seasons.entries()]
    .filter(([season]) => season >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([season, episodes]) => ({ season, episodes: [...episodes].sort((a, b) => a - b), files: counts.get(season) ?? episodes.size }));
  return { path: used, seasons: result };
}
