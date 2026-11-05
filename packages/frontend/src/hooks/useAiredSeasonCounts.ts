import { useEffect, useState } from 'react';
import type { SeriesCatalog, SeriesEpisodes, SeriesSeason } from '@lemedia/shared';
import api from '@/lib/api';

export interface AiredCount { available: number; aired: number }

/** Compare files with dated, aired episodes from the same provider numbering scheme. */
export function countAiredEpisodes(episodes: SeriesEpisodes['episodes'], now: number): AiredCount | null {
  const aired = episodes.filter(ep => {
    const date = ep.airDateUtc ? Date.parse(ep.airDateUtc) : NaN;
    return Number.isFinite(date) && date <= now;
  });
  if (aired.some(ep => ep.hasFile === null)) return null;
  return { available: aired.filter(ep => ep.hasFile).length, aired: aired.length };
}

export function useAiredSeasonCounts(tmdbId: number, seasons: SeriesSeason[], catalog: SeriesCatalog | null) {
  const [counts, setCounts] = useState<Record<number, AiredCount>>({});
  const numbers = seasons.map(s => s.seasonNumber).join(',');
  const token = catalog?.source.token;
  const tracked = catalog?.tracked && !catalog.stale;
  useEffect(() => {
    setCounts({});
    if (!tracked || !token || !numbers) return;
    const controller = new AbortController();
    const seasonNumbers = numbers.split(',').map(Number).filter(n => n > 0);
    let index = 0;
    const worker = async () => {
      while (!controller.signal.aborted && index < seasonNumbers.length) {
        const number = seasonNumbers[index++];
        try {
          const { data } = await api.get<SeriesEpisodes>(`/media/tv/${tmdbId}/seasons/${number}/episodes`, { params: { source: token }, signal: controller.signal });
          const count = !data.stale ? countAiredEpisodes(data.episodes, Date.now()) : null;
          if (count && !controller.signal.aborted) setCounts(previous => ({ ...previous, [number]: count }));
        } catch { /* Keep the count unknown if the source is unavailable. */ }
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, seasonNumbers.length) }, worker));
    return () => controller.abort();
  }, [tmdbId, numbers, token, tracked]);
  return counts;
}
