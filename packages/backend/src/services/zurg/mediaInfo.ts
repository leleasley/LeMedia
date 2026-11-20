import { prisma } from '../../utils/prisma.js';
import { getArrClientForMedia, getServiceTypeForMedia } from '../../providers/index.js';
import type { RadarrClient } from '../../providers/radarr/client.js';
import type { SonarrClient } from '../../providers/sonarr/client.js';
import { getZurgConn, zurgGet, type ZurgConn } from './client.js';
import { getZurgJobsFor } from './watcher.js';

/**
 * "What you actually got" — the real file behind a title, from zurg's stored ffprobe analysis
 * (`/api/library/entry`, no provider call, no re-probe). The file is found through Radarr /
 * Sonarr (their file path below `__magic__` is the same path in zurg's DAV view), falling back
 * to the placement of zurg's own acquisition job. Summarised to what a viewer cares about.
 */

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  color_transfer?: string;
  channels?: number;
  disposition?: { forced?: number; hearing_impaired?: number; attached_pic?: number; default?: number };
  side_data_list?: { side_data_type?: string }[];
  tags?: { language?: string; title?: string };
}
interface ProbeData {
  format?: { format_name?: string; duration?: string; bit_rate?: string; size?: string };
  streams?: ProbeStream[];
}
interface LibraryEntry { name?: string; size?: number; signed_path?: string; media_info?: ProbeData | null }

export interface FileInfo {
  release: string | null;
  /** Zurg's signed, credential-free link to this one file (relative to zurg's base URL). */
  streamPath: string | null;
  sample: { season: number; episode: number | null } | null;
  sizeBytes: number | null;
  durationSec: number | null;
  bitrateKbps: number | null;
  container: string | null;
  video: { resolution: string; width: number; height: number; codec: string; bitDepth: number | null; hdr: string | null } | null;
  audio: { lang: string | null; codec: string; channels: string | null; atmos: boolean; title: string | null; isDefault: boolean }[];
  subtitles: { lang: string | null; forced: boolean; sdh: boolean; title: string | null }[];
}

/** ISO 639-2 (what MKV tags carry) → 639-1 (what Intl.DisplayNames understands). */
const ISO2: Record<string, string> = {
  eng: 'en', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', ita: 'it', por: 'pt', rus: 'ru', jpn: 'ja',
  kor: 'ko', chi: 'zh', zho: 'zh', ara: 'ar', hin: 'hi', tam: 'ta', tel: 'te', dut: 'nl', nld: 'nl', swe: 'sv',
  nor: 'no', nob: 'nb', dan: 'da', fin: 'fi', pol: 'pl', tur: 'tr', gre: 'el', ell: 'el', heb: 'he', hun: 'hu',
  cze: 'cs', ces: 'cs', rum: 'ro', ron: 'ro', tha: 'th', vie: 'vi', ind: 'id', may: 'ms', msa: 'ms', ukr: 'uk',
  bul: 'bg', hrv: 'hr', srp: 'sr', slv: 'sl', slo: 'sk', slk: 'sk', est: 'et', lav: 'lv', lit: 'lt', ice: 'is',
  isl: 'is', per: 'fa', fas: 'fa', urd: 'ur', ben: 'bn', mal: 'ml', kan: 'kn', mar: 'mr', fil: 'tl', tgl: 'tl',
  cat: 'ca', baq: 'eu', eus: 'eu', glg: 'gl', wel: 'cy', cym: 'cy', gle: 'ga',
};
const normLang = (raw?: string): string | null => {
  const l = (raw ?? '').trim().toLowerCase();
  if (!l || l === 'und' || l === 'unk' || l === 'zxx' || l === 'mis' || l === 'mul') return null;
  return ISO2[l] ?? l;
};

const AUDIO_CODEC: Record<string, string> = {
  eac3: 'Dolby Digital Plus', ac3: 'Dolby Digital', truehd: 'Dolby TrueHD', aac: 'AAC', flac: 'FLAC',
  opus: 'Opus', mp3: 'MP3', vorbis: 'Vorbis', pcm_s16le: 'PCM', pcm_s24le: 'PCM',
};
const VIDEO_CODEC: Record<string, string> = { hevc: 'HEVC', h264: 'H.264', av1: 'AV1', vp9: 'VP9', mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2' };

function channelLabel(n?: number): string | null {
  if (!n) return null;
  return ({ 1: 'Mono', 2: 'Stereo', 6: '5.1', 7: '6.1', 8: '7.1' } as Record<number, string>)[n] ?? `${n}ch`;
}

function resolutionLabel(w: number, h: number): string {
  if (w >= 3200 || h >= 2000) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return 'SD';
}

function summarise(entry: LibraryEntry, sample: FileInfo['sample']): FileInfo | null {
  const mi = entry.media_info;
  if (!mi?.streams?.length) return null;
  const streams = mi.streams;
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic && !['mjpeg', 'png', 'bmp'].includes(s.codec_name ?? ''));

  let video: FileInfo['video'] = null;
  if (v?.width && v.height) {
    const side = (v.side_data_list ?? []).map((d) => (d.side_data_type ?? '').toLowerCase());
    const dv = side.some((t) => t.includes('dovi')) || /^dv(he|h1|av|a1)$/i.test(v.codec_tag_string ?? '');
    const hdr10plus = side.some((t) => t.includes('2094-40') || t.includes('hdr10+'));
    let hdr: string | null = null;
    if (dv) hdr = 'Dolby Vision';
    else if (hdr10plus) hdr = 'HDR10+';
    else if (v.color_transfer === 'smpte2084') hdr = 'HDR10';
    else if (v.color_transfer === 'arib-std-b67') hdr = 'HLG';
    const bitDepth = /10/.test(v.pix_fmt ?? '') || /main 10/i.test(v.profile ?? '') ? 10 : /12/.test(v.pix_fmt ?? '') ? 12 : 8;
    video = {
      resolution: resolutionLabel(v.width, v.height), width: v.width, height: v.height,
      codec: VIDEO_CODEC[v.codec_name ?? ''] ?? (v.codec_name ?? '').toUpperCase(), bitDepth, hdr,
    };
  }

  const audio = streams.filter((s) => s.codec_type === 'audio').map((s) => {
    const title = s.tags?.title?.trim() || null;
    const profile = s.profile ?? '';
    const atmos = /atmos/i.test(profile) || /atmos/i.test(title ?? '');
    let codec = AUDIO_CODEC[s.codec_name ?? ''] ?? (s.codec_name ?? '').toUpperCase();
    if (s.codec_name === 'dts') codec = /ma|master/i.test(profile) ? 'DTS-HD MA' : /x/i.test(profile) ? 'DTS:X' : profile && profile !== 'DTS' ? profile : 'DTS';
    return { lang: normLang(s.tags?.language), codec, channels: channelLabel(s.channels), atmos, title, isDefault: !!s.disposition?.default };
  });

  const subtitles = streams.filter((s) => s.codec_type === 'subtitle').map((s) => {
    const title = s.tags?.title?.trim() || null;
    return {
      lang: normLang(s.tags?.language),
      forced: !!s.disposition?.forced || /forced/i.test(title ?? ''),
      sdh: !!s.disposition?.hearing_impaired || /\bsdh\b|\bcc\b/i.test(title ?? ''),
      title,
    };
  });

  const num = (x?: string) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? n : null; };
  const duration = num(mi.format?.duration);
  const bitrate = num(mi.format?.bit_rate);
  return {
    release: entry.name ?? null,
    streamPath: entry.signed_path || null,
    sample,
    sizeBytes: entry.size ?? num(mi.format?.size),
    durationSec: duration ? Math.round(duration) : null,
    bitrateKbps: bitrate ? Math.round(bitrate / 1000) : null,
    container: (mi.format?.format_name ?? '').split(',')[0] || null,
    video, audio, subtitles,
  };
}

/** "/mnt/…/__magic__/movies/X/file.mkv" → "/dav/__magic__/movies/X/file.mkv" (segment-encoded). */
function toDavPath(fsPath: string): string | null {
  const idx = fsPath.indexOf('/__magic__/');
  if (idx === -1) return null;
  return '/dav' + fsPath.slice(idx).split('/').map((seg) => (seg ? encodeURIComponent(seg) : seg)).join('/');
}

async function entryFor(conn: ZurgConn, davPath: string): Promise<LibraryEntry | null> {
  try {
    return await zurgGet<LibraryEntry>(conn, `/api/library/entry?path=${encodeURIComponent(davPath)}`, 10_000);
  } catch {
    return null;
  }
}

// Probes don't change for a file; cache per title so a detail page never waits on zurg twice.
const cache = new Map<string, { at: number; info: FileInfo | null }>();
const CACHE_MS = 6 * 3600_000;
const MISS_MS = 10 * 60_000;

export async function getFileInfo(mediaType: 'movie' | 'tv', tmdbId: number): Promise<FileInfo | null> {
  const key = `${mediaType}:${tmdbId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.info ? CACHE_MS : MISS_MS)) return hit.info;

  const conn = await getZurgConn();
  if (!conn) return null;
  const media = await prisma.media.findFirst({
    where: { tmdbId, mediaType },
    select: { mediaType: true, radarrId: true, sonarrId: true, serviceId: true },
  });
  if (!media) return null;

  let info: FileInfo | null = null;
  try {
    if (mediaType === 'movie') {
      let davPath: string | null = null;
      if (media.radarrId) {
        const client = (await getArrClientForMedia(getServiceTypeForMedia('movie'), media.serviceId)) as unknown as RadarrClient;
        const movie = await client.getMovie(media.radarrId).catch(() => null);
        if (movie?.movieFile?.path) davPath = toDavPath(movie.movieFile.path);
      }
      if (!davPath) {
        const job = getZurgJobsFor(media).find((j) => j.state === 'done' && j.placed);
        if (job?.placed) davPath = '/dav/__magic__/' + job.placed.split('/').map(encodeURIComponent).join('/');
      }
      const entry = davPath ? await entryFor(conn, davPath) : null;
      // New Usenet releases have no `media_info` until zurg probes them. The signed link is still
      // there, and a playable file with no codec detail beats no link at all.
      info = entry ? (summarise(entry, null) ?? {
        release: entry.name ?? null,
        streamPath: entry.signed_path || null,
        sample: null,
        sizeBytes: entry.size ?? null,
        durationSec: null,
        bitrateKbps: null,
        container: null,
        video: null,
        audio: [],
        subtitles: [],
      }) : null;
    } else if (media.sonarrId) {
      const client = (await getArrClientForMedia(getServiceTypeForMedia('tv'), media.serviceId)) as unknown as SonarrClient;
      const files = (await client.getEpisodeFiles(media.sonarrId).catch(() => []))
        .filter((f) => f.path && f.seasonNumber > 0)
        .sort((a, b) => b.seasonNumber - a.seasonNumber || (a.path ?? '').localeCompare(b.path ?? ''));
      // Newest season first — the one most likely being watched; try a couple in case one is unanalysed.
      for (const f of files.slice(0, 3)) {
        const davPath = toDavPath(f.path!);
        if (!davPath) continue;
        const entry = await entryFor(conn, davPath);
        const ep = /S\d{1,2}E(\d{1,3})/i.exec(f.path!)?.[1];
        info = entry ? summarise(entry, { season: f.seasonNumber, episode: ep ? Number(ep) : null }) : null;
        if (info) break;
      }
    }
  } catch {
    info = null;
  }

  cache.set(key, { at: Date.now(), info });
  return info;
}
