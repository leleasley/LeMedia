import { getDownloads } from '../services/downloads.js';
import type { FastifyInstance } from 'fastify';
import { getArrClient } from '../providers/index.js';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';

export async function radarrSonarrRoutes(app: FastifyInstance) {
  // Radarr status
  app.get('/radarr/status', async (_request, reply) => {
    try {
      const radarr = await getArrClient('radarr');
      const status = await radarr.getSystemStatus();
      return { online: true, version: status.version };
    } catch {
      return reply.send({ online: false });
    }
  });

  // Sonarr status
  app.get('/sonarr/status', async (_request, reply) => {
    try {
      const sonarr = await getArrClient('sonarr');
      const status = await sonarr.getSystemStatus();
      return { online: true, version: status.version };
    } catch {
      return reply.send({ online: false });
    }
  });

  // Radarr queue (download status)
  app.get('/radarr/queue', async () => {
    const radarr = await getArrClient('radarr');
    const queue = await radarr.getQueue();
    return queue.records.map(raw => {
      const item = raw as { movieId: number; title: string; status: string; size: number; sizeleft: number; timeleft: string; estimatedCompletionTime: string };
      return {
        movieId: item.movieId,
        title: item.title,
        status: item.status,
        size: item.size,
        sizeLeft: item.sizeleft,
        timeLeft: item.timeleft,
        estimatedCompletion: item.estimatedCompletionTime,
        progress: item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0,
      };
    });
  });

  // Sonarr queue (download status)
  app.get('/sonarr/queue', async () => {
    const sonarr = await getArrClient('sonarr');
    const queue = await sonarr.getQueue();
    return queue.records.map(raw => {
      const item = raw as { seriesId: number; title: string; status: string; size: number; sizeleft: number; timeleft: string; estimatedCompletionTime: string; episode?: { seasonNumber: number; episodeNumber: number; title: string } };
      return {
        seriesId: item.seriesId,
        title: item.title,
        status: item.status,
        size: item.size,
        sizeLeft: item.sizeleft,
        timeLeft: item.timeleft,
        estimatedCompletion: item.estimatedCompletionTime,
        progress: item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0,
        episode: item.episode,
      };
    });
  });

  // Combined download queue mapped to tmdbId
  app.get('/downloads', async () => {
    try {
      return await getDownloads();
    } catch (err) {
      logEvent('debug', 'Downloads', `Failed to fetch queue: ${err}`);
      return [];
    }
  });

  // Library stats
  app.get('/stats', async () => {
    try {
      const [radarr, sonarr] = await Promise.all([
        getArrClient('radarr'),
        getArrClient('sonarr'),
      ]);
      const [radarrMedia, sonarrMedia] = await Promise.all([
        radarr.getAllMedia(),
        sonarr.getAllMedia(),
      ]);

      return {
        radarr: {
          totalMovies: radarrMedia.length,
          moviesWithFiles: radarrMedia.filter(m => m.statusCategory === 'AVAILABLE').length,
          monitoredMovies: radarrMedia.length, // All synced media is monitored by definition in getAllMedia
          totalSizeOnDisk: 0, // Not available via normalized interface
        },
        sonarr: {
          totalSeries: sonarrMedia.length,
          monitoredSeries: sonarrMedia.length,
          totalEpisodes: sonarrMedia.reduce((acc, s) => acc + (s.seasons?.reduce((a, se) => a + se.totalEpisodeCount, 0) ?? 0), 0),
          downloadedEpisodes: sonarrMedia.reduce((acc, s) => acc + (s.seasons?.reduce((a, se) => a + se.episodeFileCount, 0) ?? 0), 0),
          totalSizeOnDisk: 0,
        },
      };
    } catch (err) {
      logEvent('debug', 'Stats', `Failed to fetch library stats: ${err}`);
      return { error: 'Unable to retrieve statistics' };
    }
  });

  // Calendar: upcoming releases
  app.get('/calendar', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'string', description: 'Number of days to look ahead (default 30, max 90)' },
        },
      },
    },

  }, async (request) => {
    const { days } = request.query as { days?: string };
    const numDays = Math.min(Number.parseInt(days || '30', 10) || 30, 90);
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + numDays * 86400000).toISOString().slice(0, 10);

    try {
      const [radarr, sonarr] = await Promise.all([
        getArrClient('radarr'),
        getArrClient('sonarr'),
      ]);
      const [movies, episodes] = await Promise.all([
        radarr.getCalendar(start, end),
        sonarr.getCalendar(start, end),
      ]);

      // Cast calendar results to the shapes returned by each provider
      const movieItems = movies as { title: string; tmdbId: number; hasFile: boolean; digitalRelease?: string; physicalRelease?: string; inCinemas?: string; releaseDate?: string; images?: { coverType: string; remoteUrl: string }[] }[];
      const episodeItems = episodes as { seriesId: number; seasonNumber: number; episodeNumber: number; title: string; airDateUtc: string; hasFile?: boolean; series: { title: string; tvdbId: number; images: { coverType: string; remoteUrl: string }[] } }[];

      // Resolve tvdbId -> tmdbId for episodes via DB
      const tvdbIds = [...new Set(episodeItems.map((e) => e.series?.tvdbId).filter(Boolean))] as number[];
      const tvdbToTmdb = new Map<number, number>();
      const tvdbPoster = new Map<number, string>();
      if (tvdbIds.length > 0) {
        const dbMedia = await prisma.media.findMany({
          where: { tvdbId: { in: tvdbIds }, mediaType: 'tv' },
          select: { tvdbId: true, tmdbId: true, posterPath: true },
        });
        for (const m of dbMedia) {
          if (!m.tvdbId) continue;
          if (m.tmdbId > 0) tvdbToTmdb.set(m.tvdbId, m.tmdbId);
          if (m.posterPath) tvdbPoster.set(m.tvdbId, m.posterPath);
        }
      }

      // Calendar thumbnails are ~44-160px wide. Radarr hands back TMDB *original* poster URLs
      // (multi-MB) and Sonarr hands back full-size TheTVDB hotlinks, which phones fail to load
      // hundreds at a time. Prefer a bare TMDB path so the client can request a small size.
      const tmdbOriginalPrefix = /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+(\/.+)$/;
      const toPosterPath = (url: string | null | undefined): string | null => {
        if (!url) return null;
        const m = tmdbOriginalPrefix.exec(url);
        return m ? m[1] : url;
      };

      // Overlay TMDB digital release dates stored locally: Radarr only knows movies it
      // monitors (and its digitalRelease is often empty), while the daily
      // digital_release_sync job + detail-page hydration fill Media.digitalReleaseDate.
      const presentTmdbIds = new Set(movieItems.map((m) => m.tmdbId).filter(Boolean));
      const dbDigital = new Map<number, string>();
      if (presentTmdbIds.size > 0) {
        const rows = await prisma.media.findMany({
          where: { mediaType: 'movie', tmdbId: { in: [...presentTmdbIds] }, digitalReleaseDate: { not: null } },
          select: { tmdbId: true, digitalReleaseDate: true },
        });
        for (const r of rows) {
          if (r.digitalReleaseDate) dbDigital.set(r.tmdbId, r.digitalReleaseDate);
        }
      }
      const moviePoster = new Map<number, string>();
      if (presentTmdbIds.size > 0) {
        const rows = await prisma.media.findMany({
          where: { mediaType: 'movie', tmdbId: { in: [...presentTmdbIds] }, posterPath: { not: null } },
          select: { tmdbId: true, posterPath: true },
        });
        for (const r of rows) {
          if (r.posterPath) moviePoster.set(r.tmdbId, r.posterPath);
        }
      }

      // Movies TMDB says release digitally inside the window but Radarr doesn't list at
      // all (not monitored / not added yet) — surfaced so the Calendar stays complete.
      const dbOnlyItems: { type: 'movie'; title: string; date: string; tmdbId: number; poster: string | null; hasFile: boolean; releaseKind: string }[] = [];
      try {
        const upcoming = await prisma.media.findMany({
          where: {
            mediaType: 'movie',
            tmdbId: { gt: 0 },
            digitalReleaseDate: { gte: start, lte: end },
            // Only titles someone actually asked for — the Media table also holds films that
            // were merely browsed, which flooded the calendar with unrelated releases.
            requests: { some: {} },
          },
          select: { tmdbId: true, title: true, digitalReleaseDate: true, posterPath: true, statusCategory: true },
          take: 50,
        });
        for (const u of upcoming) {
          if (presentTmdbIds.has(u.tmdbId) || !u.digitalReleaseDate) continue;
          dbOnlyItems.push({
            type: 'movie',
            title: u.title,
            date: u.digitalReleaseDate,
            tmdbId: u.tmdbId,
            poster: u.posterPath || null,
            hasFile: u.statusCategory === 'AVAILABLE',
            releaseKind: 'digital',
          });
        }
      } catch (err) {
        logEvent('debug', 'Calendar', `Digital overlay lookup failed: ${err}`);
      }

      const items = [
        ...movieItems.map((m) => {
          const digitalDate = m.digitalRelease || dbDigital.get(m.tmdbId);
          return {
            type: 'movie' as const,
            title: m.title,
            date: digitalDate || m.physicalRelease || m.inCinemas || m.releaseDate || '',
            tmdbId: m.tmdbId,
            poster: moviePoster.get(m.tmdbId) ?? toPosterPath(m.images?.find((i) => i.coverType === 'poster')?.remoteUrl),
            hasFile: m.hasFile,
            // Lets the UI badge digital releases (Radarr-known or TMDB-overlay alike).
            releaseKind: digitalDate ? 'digital' : m.physicalRelease ? 'physical' : m.inCinemas ? 'cinema' : m.releaseDate ? 'theatrical' : 'unknown',
          };
        }),
        ...dbOnlyItems,
        ...episodeItems.map((e) => ({
          type: 'episode' as const,
          title: e.series?.title || 'Unknown series',
          episodeTitle: e.title,
          season: e.seasonNumber,
          episode: e.episodeNumber,
          date: e.airDateUtc,
          tvdbId: e.series?.tvdbId,
          tmdbId: e.series?.tvdbId ? tvdbToTmdb.get(e.series.tvdbId) ?? undefined : undefined,
          poster: (e.series?.tvdbId ? tvdbPoster.get(e.series.tvdbId) : undefined)
            ?? toPosterPath(e.series?.images?.find((i: { coverType: string }) => i.coverType === 'poster')?.remoteUrl),
          hasFile: !!e.hasFile,
          releaseKind: 'air',
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return items;
    } catch (err) {
      logEvent('debug', 'Calendar', `Failed to fetch calendar: ${err}`);
      return [];
    }
  });
}
