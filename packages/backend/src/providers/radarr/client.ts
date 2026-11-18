import type { ArrClient, ArrMediaItem, ArrAvailabilityResult, ArrHistoryEntry, ArrAddMediaOptions, ArrWebhookEvent } from '../types.js';
import { extractImageFromArr } from '../types.js';
import type { RadarrMovie, RadarrQueueItem, RadarrHistoryRecord } from './types.js';
import type { MediaStateCategory } from '@lemedia/shared';
import { logEvent } from '../../utils/logEvent.js';
import { ArrClientBase } from '../arrClientBase.js';
import { parseMetadata, metadataFields } from '../metadata.js';

export class RadarrClient extends ArrClientBase implements ArrClient {
  readonly mediaType = 'movie' as const;
  readonly serviceType = 'radarr';
  readonly defaultRootFolder = '/movies';

  constructor(url: string, apiKey: string) {
    super(url, apiKey, 'Radarr');
  }

  async getMovies(): Promise<RadarrMovie[]> {
    const { data } = await this.api.get('/movie');
    return data;
  }

  async lookupMetadata(identity: { tmdbId: number }) {
    const { data } = await this.api.get('/movie', { params: { tmdbId: identity.tmdbId } });
    const movie = parseMetadata(data, identity, 'movie');
    return movie ? metadataFields(movie, identity.tmdbId, 'movie') : null;
  }

  async addTagsToMedia(serviceMediaId: number, tagIds: number[]): Promise<void> {
    await this.api.put('/movie/editor', { movieIds: [serviceMediaId], tags: tagIds, applyTags: 'add' });
  }

  async getMovie(id: number): Promise<RadarrMovie> {
    const { data } = await this.api.get(`/movie/${id}`);
    return data;
  }

  async searchMovie(movieId: number): Promise<void> {
    await this.api.post('/command', { name: 'MoviesSearch', movieIds: [movieId] });
  }

  /** Rescan one movie's folder — imports files that appeared there without a search. */
  async rescanMedia(movieId: number): Promise<void> {
    await this.api.post('/command', { name: 'RescanMovie', movieId });
  }

  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    const { data } = await this.api.get('/movie', { params: { tmdbId } });
    return data[0] ?? null;
  }

  async addMovie(options: {
    title: string;
    tmdbId: number;
    qualityProfileId: number;
    rootFolderPath: string;
    tags?: number[];
    monitored?: boolean;
    searchForMovie?: boolean;
  }): Promise<RadarrMovie> {
    const { data } = await this.api.post('/movie', {
      title: options.title,
      tmdbId: options.tmdbId,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      tags: options.tags ?? [],
      monitored: options.monitored ?? true,
      addOptions: {
        searchForMovie: options.searchForMovie ?? true,
      },
    });
    return data;
  }

  /** Radarr's metadata lookup (`tmdb:603`, `imdb:tt0133093` or a title). Used by list imports. */
  async lookupMovies(term: string): Promise<Record<string, unknown>[]> {
    const { data } = await this.api.get('/movie/lookup', { params: { term } });
    return Array.isArray(data) ? data : [];
  }

  /** Add a movie from a lookup record as-is (list imports set profile, folder and addOptions). */
  async addMovieRecord(record: Record<string, unknown>): Promise<RadarrMovie> {
    const { data } = await this.api.post('/movie', record);
    return data;
  }

  /** Import-list exclusions ("never add this again"). */
  async getExclusions(): Promise<{ id: number; tmdbId?: number; movieTitle?: string; movieYear?: number }[]> {
    const { data } = await this.api.get('/exclusions');
    return Array.isArray(data) ? data : [];
  }

  /** Remove an import-list exclusion so an approved request can add the film. */
  async deleteExclusion(id: number): Promise<void> {
    await this.api.delete(`/exclusions/${id}`);
  }

  async getCalendar(start: string, end: string): Promise<RadarrMovie[]> {
    const { data } = await this.api.get('/calendar', { params: { start, end } });
    return data;
  }

  async getQueue(): Promise<{ records: RadarrQueueItem[] }> {
    const { data } = await this.api.get('/queue', {
      params: { pageSize: 50, includeMovie: true },
    });
    return data;
  }

  async getHistory(since?: Date | null): Promise<RadarrHistoryRecord[]> {
    if (since) {
      const { data } = await this.api.get('/history/since', { params: { date: since.toISOString() } });
      return (Array.isArray(data) ? data : data.records ?? [])
        .filter((r: RadarrHistoryRecord) => r.eventType === 'downloadFolderImported');
    }
    // Paginated fetch — get enough records to cover the library
    const all: RadarrHistoryRecord[] = [];
    let page = 1;
    while (true) {
      try {
        const { data } = await this.api.get('/history', {
          params: { pageSize: 1000, page, sortKey: 'date', sortDirection: 'descending' },
        });
        const records: RadarrHistoryRecord[] = data.records ?? data;
        all.push(...records.filter(r => r.eventType === 'downloadFolderImported'));
        if (records.length < 1000) break;
        page++;
      } catch {
        logEvent('debug', 'Radarr', `History pagination failed at page ${page}, using ${all.length} records collected so far`);
        break;
      }
    }
    return all;
  }

  // ─── Normalized interface methods ─────────────────────────────────

  /** Maps native Radarr state (+ queue presence) to the LeMedia vocabulary. */
  private resolveState(movie: RadarrMovie, inActiveQueue: boolean): MediaStateCategory {
    if (movie.hasFile) return 'AVAILABLE';
    if (inActiveQueue) return 'PROCESSING';
    if (!movie.monitored) return 'UNAVAILABLE';
    // Transport Radarr's own signal: isAvailable=false (announced or cinema-only) → UPCOMING.
    if (!movie.isAvailable) return 'UPCOMING';
    return 'SEARCHING';
  }

  private movieToArrItem(movie: RadarrMovie, activeQueueIds: ReadonlySet<number>): ArrMediaItem {
    return {
      serviceMediaId: movie.id,
      externalId: movie.tmdbId,
      title: movie.title,
      statusCategory: this.resolveState(movie, activeQueueIds.has(movie.id)),
      posterPath: extractImageFromArr(movie.images, 'poster'),
      backdropPath: extractImageFromArr(movie.images, 'fanart'),
      qualityProfileId: movie.qualityProfileId,
      addedDate: movie.added || null,
      tags: movie.tags || [],
      hasFile: movie.hasFile,
    };
  }

  /** movieIds currently in the download queue (⇒ PROCESSING). Best-effort. */
  private async getActiveQueueIds(): Promise<Set<number>> {
    try {
      const { records } = await this.getQueue();
      return new Set(records.map((r) => r.movieId));
    } catch {
      return new Set();
    }
  }

  async getAllMedia(): Promise<ArrMediaItem[]> {
    const [movies, activeQueueIds] = await Promise.all([this.getMovies(), this.getActiveQueueIds()]);
    return movies.map((m) => this.movieToArrItem(m, activeQueueIds));
  }

  async getMediaById(serviceMediaId: number): Promise<ArrMediaItem | null> {
    try {
      const [{ data }, activeQueueIds] = await Promise.all([
        this.api.get<RadarrMovie>(`/movie/${serviceMediaId}`),
        this.getActiveQueueIds(),
      ]);
      return data ? this.movieToArrItem(data, activeQueueIds) : null;
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
      throw err;
    }
  }

  async checkAvailability(tmdbId: number): Promise<ArrAvailabilityResult> {
    const movie = await this.getMovieByTmdbId(tmdbId);
    if (!movie?.hasFile) {
      return { available: false, audioLanguages: null, subtitleLanguages: null };
    }

    let audioLanguages: string[] | null = null;
    let subtitleLanguages: string[] | null = null;

    const mi = movie.movieFile?.mediaInfo;
    if (mi?.audioLanguages) {
      audioLanguages = mi.audioLanguages.split('/').map(s => s.trim()).filter(Boolean);
    } else if (movie.movieFile?.languages?.length) {
      audioLanguages = movie.movieFile.languages.map(l => l.name);
    }
    if (mi?.subtitles) {
      subtitleLanguages = mi.subtitles.split('/').map(s => s.trim()).filter(Boolean);
    }

    return { available: true, audioLanguages, subtitleLanguages };
  }

  async findByExternalId(tmdbId: number): Promise<{ id: number } | null> {
    const movie = await this.getMovieByTmdbId(tmdbId);
    return movie ? { id: movie.id } : null;
  }

  /** Path occupant lookup for add-time conflict resolution. The *arr names the rejected
   *  path but not the entry holding it — the caller matches it here (trailing-slash
   *  insensitive, like the root-folder resolver) to adopt-or-explain. */
  async findByPath(path: string): Promise<{ id: number; externalId: number | null; title: string } | null> {
    const { data } = await this.api.get('/movie');
    const strip = (p: string) => (p || '').replace(/\/+$/, '');
    const hit = (data as RadarrMovie[]).find((m) => strip(m.path) === strip(path));
    return hit ? { id: hit.id, externalId: hit.tmdbId ?? null, title: hit.title } : null;
  }

  async addMedia(options: ArrAddMediaOptions): Promise<void> {
    await this.addMovie({
      title: options.title,
      tmdbId: options.externalId,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      tags: options.tags,
      searchForMovie: true,
    });
  }

  async searchMedia(movieId: number): Promise<void> {
    await this.searchMovie(movieId);
  }

  async deleteMedia(movieId: number, deleteFiles = true): Promise<void> {
    await this.api.delete(`/movie/${movieId}`, { params: { deleteFiles } });
  }

  // ── File swap (zurg duplicates) ──────────────────────────────────────────────────────────

  async setMonitored(movieId: number, monitored: boolean): Promise<void> {
    const { data } = await this.api.get<RadarrMovie>(`/movie/${movieId}`);
    if (data.monitored === monitored) return;
    await this.api.put(`/movie/${movieId}`, { ...data, monitored });
  }

  /** Deletes the file from disk too (Radarr has no recycle bin set on this stack). */
  async deleteMovieFile(movieFileId: number): Promise<void> {
    await this.api.delete(`/moviefile/${movieFileId}`);
  }

  /** Runs a command and waits for it to finish (or the timeout); returns the final status. */
  async runCommand(body: Record<string, unknown>, timeoutMs = 120_000): Promise<string> {
    const { data } = await this.api.post<{ id: number }>('/command', body);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const { data: cmd } = await this.api.get<{ status?: string }>(`/command/${data.id}`);
      if (cmd.status === 'completed' || cmd.status === 'failed' || cmd.status === 'aborted') return cmd.status;
    }
    return 'timedout';
  }

  /** Radarr's own parse of the files in a folder (quality, languages) for an explicit ManualImport. */
  async getManualImport(folder: string, movieId: number): Promise<{ path: string; size?: number; quality?: unknown; languages?: unknown[]; releaseGroup?: string }[]> {
    const { data } = await this.api.get('/manualimport', { params: { folder, movieId, filterExistingFiles: false } });
    return Array.isArray(data) ? data : [];
  }

  async getHistoryEntries(since?: Date | null): Promise<ArrHistoryEntry[]> {
    const records = await this.getHistory(since);
    return records.map(r => ({
      serviceMediaId: r.movieId,
      date: new Date(r.date),
    }));
  }

  async registerWebhook(name: string, url: string, apiKey: string): Promise<number> {
    const { data } = await this.api.post('/notification', {
      name,
      implementation: 'Webhook',
      configContract: 'WebhookSettings',
      onDownload: true,
      onUpgrade: true,
      onImportComplete: true,
      onMovieAdded: true,
      onMovieDelete: true,
      includeHealthWarnings: false,
      fields: [
        { name: 'url', value: url },
        { name: 'method', value: 1 }, // POST
        { name: 'username', value: '' },
        { name: 'password', value: apiKey },
      ],
    });
    return data.id;
  }

  getWebhookEvents() {
    return [
      { key: 'Download', label: 'Import', description: 'When a movie file is imported' },
      { key: 'Upgrade', label: 'Upgrade', description: 'When a movie is upgraded to better quality' },
      { key: 'MovieAdded', label: 'Movie added', description: 'When a movie is added to the library' },
      { key: 'MovieDelete', label: 'Movie deleted', description: 'When a movie is removed from the library' },
    ];
  }

  parseWebhookPayload(body: unknown): ArrWebhookEvent | null {
    const payload = body as { eventType?: string; movie?: { id?: number; tmdbId?: number; title?: string } };
    if (!payload.eventType) return null;
    // Test event has no movie data
    if (payload.eventType === 'Test') return { type: 'test', externalId: 0, title: 'Test' };
    if (!payload.movie?.tmdbId) return null;
    const typeMap: Record<string, ArrWebhookEvent['type']> = { Download: 'download', Grab: 'grab', MovieAdded: 'added', MovieDelete: 'deleted' };
    return {
      type: typeMap[payload.eventType] || 'unknown',
      externalId: payload.movie.tmdbId,
      internalId: payload.movie.id,
      title: payload.movie.title || 'Unknown',
    };
  }
}
