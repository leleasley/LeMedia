import { getArrClient } from '../providers/index.js';
import type { ArrClient } from '../providers/types.js';
import { logEvent } from '../utils/logEvent.js';

/**
 * Radarr/Sonarr import-list exclusions ("never add this again").
 *
 * A title on that list is refused by the service, so LeMedia cannot simply forward the request.
 * Instead the request is held for approval and, when an admin approves it, the exclusion is
 * removed first — approving is the explicit decision to overturn it.
 */

export interface ExclusionInfo {
  service: 'radarr' | 'sonarr';
  id: number;
  title: string | null;
}

/** The exclusion covering this title, if any. `null` on any lookup failure (never blocks a request). */
export async function findExclusion(
  mediaType: string,
  tmdbId: number,
  tvdbId: number | null,
  client?: ArrClient | null,
): Promise<ExclusionInfo | null> {
  try {
    const arr = client ?? await getArrClient(mediaType === 'movie' ? 'radarr' : 'sonarr');
    if (mediaType === 'movie') {
      const rows = await arr.getExclusions?.() ?? [];
      const hit = rows.find((r) => r.tmdbId != null && Number(r.tmdbId) === tmdbId);
      return hit ? { service: 'radarr', id: hit.id, title: hit.movieTitle ?? null } : null;
    }
    if (!tvdbId) return null;
    const rows = await arr.getImportListExclusions?.() ?? [];
    const hit = rows.find((r) => r.tvdbId != null && Number(r.tvdbId) === tvdbId);
    return hit ? { service: 'sonarr', id: hit.id, title: hit.title ?? null } : null;
  } catch {
    return null;
  }
}

/** Delete the exclusion covering this title. Returns true when one was actually removed. */
export async function clearExclusion(
  client: ArrClient,
  mediaType: string,
  tmdbId: number,
  tvdbId: number | null,
): Promise<boolean> {
  if (!client.deleteExclusion) return false;
  const hit = await findExclusion(mediaType, tmdbId, tvdbId, client);
  if (!hit) return false;
  await client.deleteExclusion(hit.id);
  logEvent('info', 'Request', `Removed ${hit.service === 'radarr' ? 'Radarr' : 'Sonarr'} import-list exclusion for TMDB ${tmdbId}${hit.title ? ` ("${hit.title}")` : ''} to honour an approved request`);
  return true;
}
