import axios from 'axios';
import { getArrClient } from '../../providers/index.js';
import { RadarrClient } from '../../providers/radarr/client.js';
import { logEvent } from '../../utils/logEvent.js';
import { zurgPost, type ZurgConn } from './client.js';

/**
 * Swap a big in-use movie file for a smaller copy zurg already has. On this stack both copies
 * are placed in the same Radarr movie folder (`__magic__/movies/<Movie>`); Radarr just uses one.
 * Radarr deletes the big file (zurg's `allow_delete` removes that release from TorBox), then a
 * RescanMovie adopts the smaller file that is already sitting in the folder. Nothing is copied,
 * and the smaller copy is never touched, so a failed adopt can always be retried with a rescan.
 */

export const SWAP_MIN_BYTES = 20e9;
const VIDEO = /\.(mkv|mp4|m4v|avi|mov|ts|m2ts|wmv|webm)$/i;
const MAGIC_MARK = '/__magic__/';

export class SwapError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

interface CheckedRelease { hash: string; name?: string; state?: string }

async function checkReleases(conn: ZurgConn, hashes: string[]): Promise<Map<string, CheckedRelease>> {
  const res = await zurgPost<{ releases?: CheckedRelease[] }>(conn, '/manage/duplicates/check', { hashes }, 120_000);
  return new Map((res.releases ?? []).map((r) => [r.hash, r]));
}

/** Video files in a `__magic__` folder, from zurg's own WebDAV listing (no provider call). */
export async function listFolder(conn: ZurgConn, magicRel: string): Promise<{ name: string; size: number }[]> {
  const path = magicRel.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const res = await axios.request<string>({
    method: 'PROPFIND', url: `${conn.base}/dav/__magic__/${path}/`, headers: { Depth: '1' },
    timeout: 20_000, auth: conn.auth, responseType: 'text', maxContentLength: 2 * 1024 * 1024,
  });
  const out: { name: string; size: number }[] = [];
  for (const block of String(res.data).split(/<d:response>/i).slice(1)) {
    const href = /<d:href>([^<]+)<\/d:href>/i.exec(block)?.[1];
    const len = /getcontentlength>(\d+)</i.exec(block)?.[1];
    if (!href || !len) continue;
    const name = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop() ?? '');
    if (VIDEO.test(name)) out.push({ name, size: Number(len) });
  }
  return out;
}

/** The candidate check, before anything is offered: is the smaller copy's file really sitting in
 *  the movie folder? A release zurg marks broken (gone on TorBox) has an empty folder everywhere,
 *  so it would only ever fail the swap. `folderRel` comes from zurg's "radarr uses it" reason. */
export async function checkSwappable(conn: ZurgConn, folderRel: string, currentName: string, keepSize: number, keepName: string): Promise<{ ok: true } | { ok: false; reason: 'broken' | 'not_placed' }> {
  const videos = await listFolder(conn, folderRel);
  if (videos.some((v) => v.name !== currentName && v.size <= keepSize && v.size >= keepSize * 0.8)) return { ok: true };
  // Not in the folder — does the release still have any video at all?
  const own = await listFolder(conn, `__all__/${keepName}`).catch(() => []);
  return { ok: false, reason: own.length === 0 ? 'broken' : 'not_placed' };
}

export interface SwapInput { tmdbId: number; dropHash: string; keepHash: string; keepSize: number }
export interface SwapResult { title: string; newFile: string; freedBytes: number; bigRelease: 'removed' | 'trashed' | 'kept' }

const inFlight = new Set<number>();

export async function swapMovieFile(conn: ZurgConn, input: SwapInput, actor: string, onStep: (step: string) => void = () => {}): Promise<SwapResult> {
  if (inFlight.has(input.tmdbId)) throw new SwapError('BUSY', 'A swap for this movie is already running');
  inFlight.add(input.tmdbId);
  try {
    return await doSwap(conn, input, actor, onStep);
  } finally {
    inFlight.delete(input.tmdbId);
  }
}

async function doSwap(conn: ZurgConn, { tmdbId, dropHash, keepHash, keepSize }: SwapInput, actor: string, onStep: (step: string) => void): Promise<SwapResult> {
  // 1. Zurg must still see the big one in use and the small one unused.
  const before = await checkReleases(conn, [dropHash, keepHash]);
  if (before.get(dropHash)?.state !== 'referenced') throw new SwapError('STALE', 'The big copy is no longer the one Radarr uses, refresh the analysis');
  if (before.get(keepHash)?.state !== 'no_reference') throw new SwapError('STALE', 'The smaller copy is now in use or unknown, refresh the analysis');

  const client = await getArrClient('radarr');
  if (!(client instanceof RadarrClient)) throw new SwapError('NO_RADARR', 'Radarr is not configured');
  const movie = await client.getMovieByTmdbId(tmdbId);
  const file = movie?.movieFile;
  if (!movie || !movie.hasFile || !file?.id || !file.path) throw new SwapError('NO_FILE', 'Radarr has no file for this movie');
  if ((file.size ?? 0) < SWAP_MIN_BYTES) throw new SwapError('NOT_BIG', 'Radarr\'s current file is under 20 GB');

  // 2. The smaller copy must already be placed in the same movie folder — exactly one match.
  const at = movie.path.indexOf(MAGIC_MARK);
  if (at < 0) throw new SwapError('PATH', 'The movie folder is not in zurg\'s library');
  const folderRel = movie.path.slice(at + MAGIC_MARK.length);
  const currentName = file.path.split('/').pop() ?? '';
  const videos = await listFolder(conn, folderRel);
  const matches = videos.filter((v) => v.name !== currentName && v.size <= keepSize && v.size >= keepSize * 0.8);
  if (matches.length !== 1) {
    throw new SwapError('NOT_PLACED', matches.length === 0
      ? 'The smaller copy isn\'t in the movie folder, so Radarr can\'t pick it up'
      : 'More than one other file in the movie folder looks like the smaller copy');
  }
  const target = matches[0];
  const bigSize = file.size ?? 0;

  logEvent('info', 'Zurg', `Swap started by ${actor}: ${movie.title}, ${currentName} → ${target.name}`);

  // 3. Unmonitor for the few seconds the movie has no file, so an RSS sync can't grab a release.
  const wasMonitored = movie.monitored;
  let adopted = false;
  try {
    if (wasMonitored) await client.setMonitored(movie.id, false);
    onStep('Removing the big file');
    await client.deleteMovieFile(file.id);
    onStep('Radarr is rescanning');
    await client.runCommand({ name: 'RescanMovie', movieId: movie.id });
    adopted = await waitForFile(client, movie.id, target);

    // Fallback: an explicit ManualImport of that one file, using Radarr's own parse.
    if (!adopted) {
      onStep('Importing the smaller file');
      const items = await client.getManualImport(movie.path, movie.id);
      const item = items.find((i) => i.path.split('/').pop() === target.name);
      if (item) {
        await client.runCommand({
          name: 'ManualImport', importMode: 'Move',
          files: [{ path: item.path, movieId: movie.id, quality: item.quality, languages: item.languages ?? [], releaseGroup: item.releaseGroup ?? '' }],
        });
        adopted = await waitForFile(client, movie.id, target);
      }
    }
  } finally {
    if (wasMonitored) await client.setMonitored(movie.id, true).catch((err) => logEvent('warn', 'Zurg', `Swap: could not re-monitor ${movie.title}: ${String(err)}`));
  }

  if (!adopted) {
    logEvent('error', 'Zurg', `Swap for ${movie.title}: big file deleted but Radarr has not adopted ${target.name} yet`);
    throw new SwapError('NOT_ADOPTED', 'The big file was removed but Radarr hasn\'t picked up the smaller one yet, run a rescan of the movie in Radarr');
  }

  // 4. allow_delete should already have removed the big release; if zurg still lists it as
  //    unused, send it to zurg's trash the same way the cleanup does.
  onStep('Confirming with Zurg');
  let bigRelease: SwapResult['bigRelease'] = 'removed';
  try {
    const after = await checkReleases(conn, [dropHash]);
    const st = after.get(dropHash)?.state;
    if (st === 'no_reference') {
      await zurgPost(conn, '/manage/bulk-delete', { hashes: [dropHash] }, 120_000);
      bigRelease = 'trashed';
    } else if (st === 'referenced') {
      bigRelease = 'kept';
    }
  } catch (err) {
    logEvent('warn', 'Zurg', `Swap for ${movie.title}: could not confirm the big release was removed: ${String(err)}`);
  }

  logEvent('info', 'Zurg', `Swap done for ${movie.title}: now ${target.name}; big release ${bigRelease}`);
  return { title: movie.title, newFile: target.name, freedBytes: Math.max(0, bigSize - target.size), bigRelease };
}

/** Radarr may rename on a ManualImport, so a size match counts as the same file. */
async function waitForFile(client: RadarrClient, movieId: number, target: { name: string; size: number }): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    const m = await client.getMovie(movieId);
    if (m.hasFile && ((m.movieFile?.path ?? '').endsWith(`/${target.name}`) || m.movieFile?.size === target.size)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
