import { getArrClient } from '../providers/index.js';
import type { RadarrClient } from '../providers/radarr/client.js';
import type { SonarrClient } from '../providers/sonarr/client.js';
import { logEvent } from '../utils/logEvent.js';
import { selectedDmmService } from './dmm.js';

/**
 * Optional bridge for installations that run both DMM and Radarr/Sonarr.
 *
 * Zurg fetched the title into its own library, but the *arr has no record of it. When the admin
 * turns this on, a completed DMM placement is added to the *arr **without searching** and the
 * title is rescanned, so the file Zurg placed can be imported if it lands inside that *arr's
 * library folder. Purely best-effort: when Zurg writes to `__magic__` and the *arr points
 * elsewhere, the scan simply finds nothing and the title stays DMM-only.
 */

interface DmmMedia {
  mediaType: string;
  title: string;
  tmdbId: number;
  tvdbId?: number | null;
}

let warnedMissingDefaults = false;

async function defaults(client: RadarrClient | SonarrClient): Promise<{ profileId: number; root: string } | null> {
  try {
    const [profiles, roots] = await Promise.all([client.getQualityProfiles(), client.getRootFolders()]);
    const root = roots.find((r) => (r as { accessible?: boolean }).accessible !== false) ?? roots[0];
    if (!profiles.length || !root) return null;
    return { profileId: profiles[0].id, root: root.path };
  } catch {
    return null;
  }
}

export async function syncDmmToArr(media: DmmMedia): Promise<void> {
  const dmm = await selectedDmmService();
  if (!dmm || dmm.config.syncToArr !== 'true') return;
  try {
    if (media.mediaType === 'movie') {
      const client = (await getArrClient('radarr').catch(() => null)) as RadarrClient | null;
      if (!client || !media.tmdbId) return;
      const existing = await client.findByExternalId(media.tmdbId).catch(() => null);
      if (existing) {
        await client.rescanMedia?.(existing.id);
        logEvent('info', 'DMM', `Rescanned "${media.title}" in Radarr`);
        return;
      }
      const fallback = await defaults(client);
      if (!fallback) { logOnce('Radarr has no quality profile or root folder'); return; }
      const candidates = await client.lookupMovies(`tmdb:${media.tmdbId}`);
      const record = candidates.find((r) => String(r.tmdbId ?? '') === String(media.tmdbId));
      if (!record) { logEvent('debug', 'DMM', `Radarr has no metadata for "${media.title}"`); return; }
      delete record.id;
      Object.assign(record, {
        qualityProfileId: fallback.profileId,
        rootFolderPath: fallback.root,
        monitored: false,
        minimumAvailability: 'released',
        // No search: Zurg already fetched this. We only want the import of what is on disk.
        addOptions: { monitor: 'none', searchForMovie: false },
      });
      const added = await client.addMovieRecord(record);
      await client.rescanMedia?.(added.id);
      logEvent('info', 'DMM', `Added "${media.title}" to Radarr (unmonitored) and rescanned`);
      return;
    }

    if (!media.tvdbId) return;
    const client = (await getArrClient('sonarr').catch(() => null)) as SonarrClient | null;
    if (!client) return;
    const existing = await client.findByExternalId(media.tvdbId).catch(() => null);
    if (existing) {
      await client.rescanMedia?.(existing.id);
      logEvent('info', 'DMM', `Rescanned "${media.title}" in Sonarr`);
      return;
    }
    const fallback = await defaults(client);
    if (!fallback) { logOnce('Sonarr has no quality profile or root folder'); return; }
    const candidates = await client.lookupSeries(`tvdb:${media.tvdbId}`);
    const record = candidates.find((r) => String(r.tvdbId ?? '') === String(media.tvdbId));
    if (!record) { logEvent('debug', 'DMM', `Sonarr has no metadata for "${media.title}"`); return; }
    delete record.id;
    Object.assign(record, {
      qualityProfileId: fallback.profileId,
      rootFolderPath: fallback.root,
      monitored: false,
      seasonFolder: true,
      addOptions: { monitor: 'none', searchForMissingEpisodes: false },
    });
    const added = await client.addSeriesRecord(record);
    await client.rescanMedia?.(added.id);
    logEvent('info', 'DMM', `Added "${media.title}" to Sonarr (unmonitored) and rescanned`);
  } catch (err) {
    logEvent('warn', 'DMM', `Could not mirror "${media.title}" into Radarr/Sonarr: ${(err as Error).message}`);
  }
}

function logOnce(message: string): void {
  if (warnedMissingDefaults) return;
  warnedMissingDefaults = true;
  logEvent('warn', 'DMM', `${message}; skipping the Radarr/Sonarr mirror until one exists`);
}
