import axios from 'axios';
import { getServiceById, parseServiceConfig } from '../utils/services.js';
import { prisma } from '../utils/prisma.js';
import { getMovieDetails, getTvDetails, getTmdbApi } from './tmdb.js';

const origin = 'https://debridmediamanager.com/api/arr';
const active = new Set<string>();

/** An explicit administrator choice. Missing config preserves existing *arr routing. */
export async function selectedDmmService() {
  const services = await prisma.service.findMany({ where: { type: 'dmm' }, orderBy: { id: 'asc' } });
  const row = services.find(s => parseServiceConfig(s.config).routeRequests === 'true');
  return row ? { ...row, config: parseServiceConfig(row.config) } : null;
}

/** DMM replaces wanted seasons on update. Serialize within this instance and merge every
 * monitored season. DMM has no conditional update, so external concurrent edits cannot be
 * made atomic; avoid writes when a show is already being monitored in full. */
export async function sendToDmm(serviceId: number, type: 'movie' | 'tv', tmdbId: number, seasons?: number[], numbering?: string | null) {
  const service = await getServiceById(serviceId);
  if (!service || service.type !== 'dmm' || !service.config.apiKey?.trim()) throw new Error('DMM service is disabled or missing');
  const lock = `${serviceId}:${type}:${tmdbId}`;
  if (active.has(lock)) throw new Error('DMM request already in progress; retry');
  active.add(lock);
  try {
    const details = type === 'movie' ? await getMovieDetails(tmdbId) : await getTvDetails(tmdbId);
    const imdbId = details.external_ids?.imdb_id;
    if (!imdbId || !/^tt\d+$/.test(imdbId)) throw new Error('TMDB has no IMDb identity for DMM');
    const tvdbId = type === 'tv' ? details.external_ids?.tvdb_id : undefined;
    if (type === 'tv') {
      if (!tvdbId || !Number.isInteger(tvdbId)) throw new Error('TMDB has no TVDB identity for DMM');
      const { data } = await getTmdbApi().get(`/find/${tvdbId}`, { params: { external_source: 'tvdb_id' } });
      if (!Array.isArray(data?.tv_results) || data.tv_results.length !== 1 || data.tv_results[0]?.id !== tmdbId) throw new Error('TMDB and TVDB identities do not match');
      if (seasons?.length && numbering !== 'tmdb:official') throw new Error('Season numbering is not TMDB; reload the season list');
    }
    const url = `${origin}/${type === 'movie' ? 'radarr/api/v3/movie' : 'sonarr/api/v3/series'}`;
    const options = { headers: { 'X-API-Key': service.config.apiKey.trim(), Accept: 'application/json' }, timeout: 15000, maxRedirects: 0 };
    const { data } = await axios.get(`${url}/lookup`, { ...options, params: { term: type === 'movie' ? `tmdb:${tmdbId}` : `tvdb:${tvdbId}` } });
    if (!Array.isArray(data) || data.length !== 1) throw new Error('DMM did not return a unique match');
    const found = data[0] as { tmdbId?: number; tvdbId?: number; imdbId?: string; monitored?: boolean; monitorNewItems?: string; seasons?: { seasonNumber: number; monitored: boolean }[] };
    if (found.imdbId !== imdbId || typeof found.monitored !== 'boolean' || (type === 'movie' ? found.tmdbId !== tmdbId : found.tvdbId !== tvdbId)) throw new Error('DMM identity mismatch');
    if (type === 'movie') {
      if (!found.monitored) await axios.post(url, { tmdbId }, options);
      return;
    }
    if (!Array.isArray(found.seasons) || !found.seasons.length || found.seasons.some(s => !Number.isInteger(s.seasonNumber) || s.seasonNumber < 1 || typeof s.monitored !== 'boolean')) throw new Error('DMM season catalog unavailable');
    if (found.monitored && found.monitorNewItems === 'all') return;
    const requested = seasons?.length ? seasons : found.seasons.map(s => s.seasonNumber);
    if (requested.some(n => !found.seasons!.some(s => s.seasonNumber === n))) throw new Error('DMM season does not match TMDB');
    if (found.monitored && seasons?.length && requested.every(n => found.seasons!.some(s => s.seasonNumber === n && s.monitored))) return;
    const wanted = new Set([...requested, ...found.seasons.filter(s => s.monitored).map(s => s.seasonNumber)]);
    await axios.post(url, { tvdbId, seasons: found.seasons.map(s => ({ seasonNumber: s.seasonNumber, monitored: wanted.has(s.seasonNumber) })) }, options);
  } finally { active.delete(lock); }
}
