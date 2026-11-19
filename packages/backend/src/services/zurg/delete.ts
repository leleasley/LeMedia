import axios from 'axios';
import { getZurgConn, type ZurgConn } from './client.js';
import { logEvent } from '../../utils/logEvent.js';

/**
 * Delete a title from Zurg's library.
 *
 * Zurg owns the debrid-side releases: a WebDAV DELETE on a title's folder removes the release
 * from the debrid account (zurg's `allow_delete`), and the mount stops serving it. This is the
 * counterpart to the *arr deletion — an install driven by Zurg has no Radarr/Sonarr entry to
 * delete, so the file has to be removed here instead.
 */

export class ZurgDeleteError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ZurgDeleteError';
  }
}

const TIMEOUT_MS = 2 * 60_000;

function basicAuth(conn: ZurgConn): Record<string, string> {
  if (!conn.auth) return {};
  return { Authorization: 'Basic ' + Buffer.from(`${conn.auth.username}:${conn.auth.password}`).toString('base64') };
}

/** `/dav/__magic__/movies/Heat (1995)/` — the exact folder, already URI-encoded per segment. */
function encodePath(path: string): string {
  return '/' + path.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/');
}

async function listFolders(conn: ZurgConn, root: '/dav/__magic__/movies' | '/dav/__magic__/tv'): Promise<{ name: string; path: string }[]> {
  const { data } = await axios.request<string>({
    method: 'PROPFIND',
    url: `${conn.base}${root}`,
    headers: { Depth: '1', ...basicAuth(conn) },
    timeout: 30_000,
    responseType: 'text',
    maxContentLength: 32 * 1024 * 1024,
    validateStatus: (s) => s === 207 || s === 200,
  });
  const out: { name: string; path: string }[] = [];
  for (const match of data.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)) {
    if (!match[1].includes('<d:collection/>')) continue;
    const href = /<d:href>([^<]+)<\/d:href>/.exec(match[1])?.[1] ?? '';
    const decoded = decodeURIComponent(href);
    const name = decoded.replace(/\/+$/, '').split('/').pop() ?? '';
    if (!name || name === 'movies' || name === 'tv') continue;
    out.push({ name, path: decoded.endsWith('/') ? decoded : `${decoded}/` });
  }
  return out;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The folder that represents this title, when the row predates the Zurg scan that records it. */
async function findFolder(conn: ZurgConn, mediaType: string, title: string): Promise<string | null> {
  const folders = await listFolders(conn, mediaType === 'movie' ? '/dav/__magic__/movies' : '/dav/__magic__/tv');
  const wanted = normalise(title);
  const exact = folders.find((f) => normalise(f.name) === wanted);
  if (exact) return exact.path;
  // "Heat (1995)" on disk vs "Heat" in TMDB, and the reverse.
  const partial = folders.find((f) => normalise(f.name).replace(/\s+\d{4}$/, '') === wanted);
  return partial?.path ?? null;
}

/** Delete one title from Zurg. Returns false when it was not there. */
export async function deleteFromZurg(media: {
  title: string; mediaType: string; zurgPath?: string | null;
}): Promise<boolean> {
  const conn = await getZurgConn().catch(() => null);
  if (!conn) throw new ZurgDeleteError('Zurg is not configured', 404);

  const current = media.zurgPath ?? await findFolder(conn, media.mediaType, media.title);
  if (!current) return false;

  const response = await axios.request({
    method: 'DELETE',
    url: `${conn.base}${encodePath(current)}`,
    headers: basicAuth(conn),
    timeout: TIMEOUT_MS,
    maxRedirects: 0,
    validateStatus: () => true,
  }).catch(() => { throw new ZurgDeleteError('Could not reach Zurg', 502); });

  if (response.status === 404) return false;
  if (response.status >= 400) {
    throw new ZurgDeleteError(
      `Zurg refused to delete that title (HTTP ${response.status}) — check that deleting through the mount is allowed`,
      502,
    );
  }
  logEvent('info', 'Zurg', `Deleted "${media.title}" from Zurg — the release is removed from the debrid account`);
  return true;
}
