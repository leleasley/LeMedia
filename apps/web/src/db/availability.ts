import { getPool } from "./core";


let ensurePlexAvailabilitySchemaPromise: Promise<void> | null = null;
async function ensurePlexAvailabilitySchema() {
  if (ensurePlexAvailabilitySchemaPromise) return ensurePlexAvailabilitySchemaPromise;
  ensurePlexAvailabilitySchemaPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS plex_availability (
        id BIGSERIAL PRIMARY KEY,
        tmdb_id INTEGER,
        tvdb_id INTEGER,
        imdb_id TEXT,
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','episode','season','series')),
        title TEXT,
        season_number INTEGER,
        episode_number INTEGER,
        air_date DATE,
        plex_item_id TEXT UNIQUE NOT NULL,
        plex_library_id TEXT,
        last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_plex_availability_tmdb ON plex_availability(tmdb_id);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_plex_availability_tvdb ON plex_availability(tvdb_id);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_plex_availability_imdb ON plex_availability(imdb_id);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_plex_availability_scanned ON plex_availability(last_scanned_at DESC);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS plex_scan_log (
        id BIGSERIAL PRIMARY KEY,
        library_id TEXT,
        library_name TEXT,
        items_scanned INTEGER NOT NULL DEFAULT 0,
        items_added INTEGER NOT NULL DEFAULT 0,
        items_removed INTEGER NOT NULL DEFAULT 0,
        scan_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        scan_completed_at TIMESTAMPTZ,
        scan_status TEXT NOT NULL DEFAULT 'running' CHECK (scan_status IN ('running','completed','failed')),
        error_message TEXT
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_plex_scan_log_started ON plex_scan_log(scan_started_at DESC);`);
  })();
  return ensurePlexAvailabilitySchemaPromise;
}

export async function upsertPlexAvailability(params: {
  tmdbId?: number | null;
  tvdbId?: number | null;
  imdbId?: string | null;
  mediaType: 'movie' | 'episode' | 'season' | 'series';
  title?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  airDate?: string | null;
  plexItemId: string;
  plexLibraryId?: string | null;
}): Promise<{ isNew: boolean }> {
  await ensurePlexAvailabilitySchema();
  const p = getPool();
  const res = await p.query(
    `INSERT INTO plex_availability
      (tmdb_id, tvdb_id, imdb_id, media_type, title, season_number, episode_number, air_date, plex_item_id, plex_library_id, last_scanned_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    ON CONFLICT (plex_item_id)
    DO UPDATE SET
      last_scanned_at = NOW(),
      title = COALESCE($5, plex_availability.title),
      tmdb_id = COALESCE($1, plex_availability.tmdb_id),
      tvdb_id = COALESCE($2, plex_availability.tvdb_id),
      imdb_id = COALESCE($3, plex_availability.imdb_id),
      air_date = COALESCE($8, plex_availability.air_date)
    RETURNING (xmax = 0) AS is_new`,
    [
      params.tmdbId ?? null,
      params.tvdbId ?? null,
      params.imdbId ?? null,
      params.mediaType,
      params.title ?? null,
      params.seasonNumber ?? null,
      params.episodeNumber ?? null,
      params.airDate ?? null,
      params.plexItemId,
      params.plexLibraryId ?? null
    ]
  );
  return { isNew: res.rows[0]?.is_new ?? false };
}


export async function startPlexScan(params: {
  libraryId?: string | null;
  libraryName?: string | null;
}): Promise<number> {
  await ensurePlexAvailabilitySchema();
  const p = getPool();
  const res = await p.query(
    `INSERT INTO plex_scan_log
      (library_id, library_name, items_scanned, items_added, items_removed, scan_started_at, scan_status)
    VALUES ($1, $2, 0, 0, 0, NOW(), 'running')
    RETURNING id`,
    [params.libraryId ?? null, params.libraryName ?? null]
  );
  return res.rows[0].id;
}


export async function updatePlexScan(scanId: number, params: {
  itemsScanned?: number;
  itemsAdded?: number;
  itemsRemoved?: number;
  scanStatus?: 'running' | 'completed' | 'failed';
  errorMessage?: string | null;
}): Promise<void> {
  await ensurePlexAvailabilitySchema();
  const p = getPool();
  const updates: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (params.itemsScanned !== undefined) {
    values.push(params.itemsScanned);
    updates.push(`items_scanned = $${paramIdx++}`);
  }
  if (params.itemsAdded !== undefined) {
    values.push(params.itemsAdded);
    updates.push(`items_added = $${paramIdx++}`);
  }
  if (params.itemsRemoved !== undefined) {
    values.push(params.itemsRemoved);
    updates.push(`items_removed = $${paramIdx++}`);
  }
  if (params.scanStatus !== undefined) {
    values.push(params.scanStatus);
    updates.push(`scan_status = $${paramIdx++}`);
    if (params.scanStatus !== "running") {
      updates.push(`scan_completed_at = NOW()`);
    }
  }
  if (params.errorMessage !== undefined) {
    values.push(params.errorMessage);
    updates.push(`error_message = $${paramIdx++}`);
  }
  if (!updates.length) return;
  values.push(scanId);
  await p.query(
    `UPDATE plex_scan_log SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
    values
  );
}


// ===== Jellyfin Availability Cache =====

export type JellyfinAvailabilityItem = {
  id: number;
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;
  mediaType: 'movie' | 'episode' | 'season' | 'series';
  title: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  airDate: string | null;
  jellyfinItemId: string;
  jellyfinLibraryId: string | null;
  lastScannedAt: string;
  createdAt: string;
};


export type JellyfinScanLog = {
  id: number;
  libraryId: string | null;
  libraryName: string | null;
  itemsScanned: number;
  itemsAdded: number;
  itemsRemoved: number;
  scanStartedAt: string;
  scanCompletedAt: string | null;
  scanStatus: 'running' | 'completed' | 'failed';
  errorMessage: string | null;
};


export type NewJellyfinItem = {
  jellyfinItemId: string;
  title: string | null;
  mediaType: 'movie' | 'episode' | 'season' | 'series';
  tmdbId: number | null;
  addedAt: string;
};


export async function hasCachedEpisodeAvailability(params: {
  tmdbId: number;
  tvdbId?: number | null;
}): Promise<boolean> {
  const p = getPool();
  const tvdbId = params.tvdbId ?? null;
  const res = await p.query(
    `SELECT 1
     FROM jellyfin_availability
     WHERE media_type = 'episode'
       AND (tmdb_id = $1 OR ($2::int IS NOT NULL AND tvdb_id = $2::int))
     LIMIT 1`,
    [params.tmdbId, tvdbId]
  );
  return (res.rowCount ?? 0) > 0;
}


export async function hasRecentJellyfinAvailabilityScan(maxAgeMs: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(`SELECT MAX(last_scanned_at) AS last_scanned_at FROM jellyfin_availability`);
  const last = res.rows[0]?.last_scanned_at;
  if (!last) return false;
  const lastMs = new Date(last).getTime();
  if (!Number.isFinite(lastMs)) return false;
  return Date.now() - lastMs <= maxAgeMs;
}


export async function getAvailableSeasons(params: {
  tmdbId: number;
  tvdbId?: number | null;
}): Promise<number[]> {
  const p = getPool();
  const tvdbId = params.tvdbId ?? null;
  const res = await p.query(
    `SELECT DISTINCT season_number
     FROM jellyfin_availability
     WHERE media_type = 'episode'
       AND season_number IS NOT NULL
       AND (tmdb_id = $1 OR ($2::int IS NOT NULL AND tvdb_id = $2::int))
     ORDER BY season_number`,
    [params.tmdbId, tvdbId]
  );
  return res.rows.map((row: any) => row.season_number);
}


export async function getCachedJellyfinSeriesItemId(params: {
  tmdbId: number;
  tvdbId?: number | null;
}): Promise<string | null> {
  const p = getPool();
  const tvdbId = params.tvdbId ?? null;
  const res = await p.query(
    `SELECT jellyfin_item_id
     FROM jellyfin_availability
     WHERE media_type = 'series'
       AND (tmdb_id = $1 OR ($2::int IS NOT NULL AND tvdb_id = $2::int))
     ORDER BY last_scanned_at DESC
     LIMIT 1`,
    [params.tmdbId, tvdbId]
  );
  return res.rows[0]?.jellyfin_item_id ?? null;
}


export async function upsertJellyfinAvailability(params: {
  tmdbId?: number | null;
  tvdbId?: number | null;
  imdbId?: string | null;
  mediaType: 'movie' | 'episode' | 'season' | 'series';
  title?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  airDate?: string | null;
  jellyfinItemId: string;
  jellyfinLibraryId?: string | null;
}): Promise<{ isNew: boolean }> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO jellyfin_availability
      (tmdb_id, tvdb_id, imdb_id, media_type, title, season_number, episode_number, air_date, jellyfin_item_id, jellyfin_library_id, last_scanned_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    ON CONFLICT (jellyfin_item_id)
    DO UPDATE SET
      last_scanned_at = NOW(),
      title = COALESCE($5, jellyfin_availability.title),
      tmdb_id = COALESCE($1, jellyfin_availability.tmdb_id),
      tvdb_id = COALESCE($2, jellyfin_availability.tvdb_id),
      imdb_id = COALESCE($3, jellyfin_availability.imdb_id),
      air_date = COALESCE($8, jellyfin_availability.air_date)
    RETURNING (xmax = 0) AS is_new`,
    [
      params.tmdbId ?? null,
      params.tvdbId ?? null,
      params.imdbId ?? null,
      params.mediaType,
      params.title ?? null,
      params.seasonNumber ?? null,
      params.episodeNumber ?? null,
      params.airDate ?? null,
      params.jellyfinItemId,
      params.jellyfinLibraryId ?? null
    ]
  );
  return { isNew: res.rows[0]?.is_new ?? false };
}


export async function getNewJellyfinItems(sinceDate?: Date, limit = 100): Promise<NewJellyfinItem[]> {
  const p = getPool();
  const query = sinceDate
    ? `SELECT jellyfin_item_id as "jellyfinItemId", title, media_type as "mediaType",
              tmdb_id as "tmdbId", created_at as "addedAt"
       FROM jellyfin_availability
       WHERE created_at > $1
       ORDER BY created_at DESC
       LIMIT $2`
    : `SELECT jellyfin_item_id as "jellyfinItemId", title, media_type as "mediaType",
              tmdb_id as "tmdbId", created_at as "addedAt"
       FROM jellyfin_availability
       ORDER BY created_at DESC
       LIMIT $1`;

  const params = sinceDate ? [sinceDate, limit] : [limit];
  const res = await p.query(query, params);
  return res.rows;
}


export async function startJellyfinScan(params: {
  libraryId?: string | null;
  libraryName?: string | null;
}): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO jellyfin_scan_log
      (library_id, library_name, items_scanned, items_added, items_removed, scan_started_at, scan_status)
    VALUES ($1, $2, 0, 0, 0, NOW(), 'running')
    RETURNING id`,
    [params.libraryId ?? null, params.libraryName ?? null]
  );
  return res.rows[0].id;
}


export async function updateJellyfinScan(scanId: number, params: {
  itemsScanned?: number;
  itemsAdded?: number;
  itemsRemoved?: number;
  scanStatus?: 'running' | 'completed' | 'failed';
  errorMessage?: string | null;
}): Promise<void> {
  const p = getPool();
  const updates: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (params.itemsScanned !== undefined) {
    updates.push(`items_scanned = $${paramIdx++}`);
    values.push(params.itemsScanned);
  }
  if (params.itemsAdded !== undefined) {
    updates.push(`items_added = $${paramIdx++}`);
    values.push(params.itemsAdded);
  }
  if (params.itemsRemoved !== undefined) {
    updates.push(`items_removed = $${paramIdx++}`);
    values.push(params.itemsRemoved);
  }
  if (params.scanStatus) {
    updates.push(`scan_status = $${paramIdx++}`);
    values.push(params.scanStatus);
    if (params.scanStatus === 'completed' || params.scanStatus === 'failed') {
      updates.push(`scan_completed_at = NOW()`);
    }
  }
  if (params.errorMessage !== undefined) {
    updates.push(`error_message = $${paramIdx++}`);
    values.push(params.errorMessage);
  }

  if (updates.length === 0) return;

  values.push(scanId);
  await p.query(
    `UPDATE jellyfin_scan_log SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
    values
  );
}


export async function getRecentJellyfinScans(limit = 10): Promise<JellyfinScanLog[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, library_id as "libraryId", library_name as "libraryName",
            items_scanned as "itemsScanned", items_added as "itemsAdded",
            items_removed as "itemsRemoved", scan_started_at as "scanStartedAt",
            scan_completed_at as "scanCompletedAt", scan_status as "scanStatus",
            error_message as "errorMessage"
     FROM jellyfin_scan_log
     ORDER BY scan_started_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}
