import { useEffect, useState } from 'react';
import api from '@/lib/api';

export interface MediaExclusion {
  excluded: boolean;
  service: 'radarr' | 'sonarr' | null;
  /** The media server already holds it — an exclusion does not matter then. */
  inLibrary?: boolean;
}

/** Is this title on the service's import-list exclusions? Read-only: requesting it is still
 *  allowed, but the request is held for an admin who overturns the exclusion by approving. */
export function useMediaExclusion(mediaType: 'movie' | 'tv', tmdbId: number | null | undefined): MediaExclusion | null {
  const [state, setState] = useState<MediaExclusion | null>(null);
  useEffect(() => {
    if (!tmdbId) return;
    let alive = true;
    api.get<MediaExclusion>('/media/exclusion', { params: { tmdbId, mediaType } })
      .then(({ data }) => { if (alive) setState(data.excluded ? data : null); })
      .catch(() => { if (alive) setState(null); });
    return () => { alive = false; };
  }, [mediaType, tmdbId]);
  return state;
}
