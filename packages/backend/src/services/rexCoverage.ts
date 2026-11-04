import { getTmdbApi } from './tmdb.js';
import { rexGet, type RexConn } from './rex.js';

interface Item { ratingKey?: string; title?: string; year?: number; type?: string; guid?: string; Guid?: { id: string }[]; parentIndex?: number; index?: number }
interface Container { MediaContainer?: { Metadata?: Item[]; Directory?: { key: string; title: string; type: string }[]; totalSize?: number } }

async function pages(conn: RexConn, path: string): Promise<Item[]> {
  const result: Item[] = [];
  for (let offset = 0; ; offset += 200) {
    const separator = path.includes('?') ? '&' : '?';
    const data = await rexGet<Container>(conn, `${path}${separator}X-Plex-Container-Start=${offset}&X-Plex-Container-Size=200`, 30000);
    if (!data.MediaContainer) throw new Error('Invalid REX response');
    const rows = data.MediaContainer.Metadata ?? [];
    result.push(...rows);
    if (data.MediaContainer.totalSize !== undefined && result.length < data.MediaContainer.totalSize && !rows.length) throw new Error('REX returned an incomplete inventory');
    if (data.MediaContainer.totalSize !== undefined ? result.length >= data.MediaContainer.totalSize : rows.length < 200) break;
  }
  return result;
}

export async function rexShows(conn: RexConn) {
  const data = await rexGet<Container>(conn, '/library/sections');
  if (!data.MediaContainer || !Array.isArray(data.MediaContainer.Directory)) throw new Error('Invalid REX library response');
  const sections = data.MediaContainer.Directory.filter(s => s.type === 'show' && /^\d+$/.test(String(s.key)));
  const shows = await Promise.all(sections.map(async s => (await pages(conn, `/library/sections/${s.key}/all?type=2&includeGuids=1`))
    .filter(x => x.ratingKey && /^\d+$/.test(String(x.ratingKey)))
    .map(x => ({ key: String(x.ratingKey), title: x.title || 'Unknown', year: x.year || null, library: s.title }))));
  return shows.flat();
}

export async function rexShowCoverage(conn: RexConn, key: string) {
  const metadata = await rexGet<Container>(conn, `/library/metadata/${key}?includeGuids=1`);
  const show = metadata.MediaContainer?.Metadata?.[0];
  if (!show || show.type !== 'show') throw new Error('Show not found in REX');
  const ids = [show.guid, ...(show.Guid ?? []).map(g => g.id)].filter((v): v is string => !!v).join(' ');
  const tmdbId = /(?:tmdb:\/\/|themoviedb\.org\/tv\/)(\d+)/i.exec(ids)?.[1];
  const imdbId = /tt\d{6,12}/i.exec(ids)?.[0];
  const tmdb = getTmdbApi();
  let id = tmdbId ? Number(tmdbId) : 0;
  if (!id && imdbId) {
    const { data } = await tmdb.get(`/find/${imdbId}`, { params: { external_source: 'imdb_id' } });
    if (data.tv_results?.length === 1) id = data.tv_results[0].id;
  }
  if (!id && show.title && show.year) {
    const { data } = await tmdb.get('/search/tv', { params: { query: show.title, first_air_date_year: show.year } });
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const matches = (data.results ?? []).filter((x: { name?: string; first_air_date?: string }) => norm(x.name || '') === norm(show.title!) && x.first_air_date?.slice(0, 4) === String(show.year));
    if (matches.length === 1) id = matches[0].id;
  }
  if (!id) return { verified: false, reason: 'No unambiguous TMDB match' };
  const [leaves, detail] = await Promise.all([
    pages(conn, `/library/metadata/${key}/allLeaves`),
    tmdb.get(`/tv/${id}`, { params: { append_to_response: 'external_ids' } }),
  ]);
  const present = new Set(leaves.filter(x => (x.parentIndex ?? 0) > 0 && (x.index ?? 0) > 0).map(x => `${x.parentIndex}:${x.index}`));
  const seasons = (detail.data.seasons ?? []).filter((s: { season_number: number }) => s.season_number > 0);
  const missing: { season: number; episode: number; title: string; airDate: string }[] = [];
  let aired = 0, unknownDates = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const season of seasons) {
    const { data } = await tmdb.get(`/tv/${id}/season/${season.season_number}`);
    for (const ep of data.episodes ?? []) {
      if (!ep.air_date) { unknownDates++; continue; }
      if (ep.air_date > today || ep.episode_number <= 0) continue;
      aired++;
      if (!present.has(`${season.season_number}:${ep.episode_number}`)) missing.push({ season: season.season_number, episode: ep.episode_number, title: ep.name || 'Untitled episode', airDate: ep.air_date });
    }
  }
  return { verified: true, tmdbId: id, imdbId: detail.data.external_ids?.imdb_id || imdbId || null, status: detail.data.status || 'Unknown', genres: (detail.data.genres ?? []).map((g: { name: string }) => g.name), present: present.size, aired, missing, unknownDates };
}
