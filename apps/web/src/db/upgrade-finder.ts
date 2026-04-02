import { getPool, ensureSchema } from "./core";


export type UpgradeFinderHint = {
  mediaType: "movie" | "tv";
  mediaId: number;
  status: "available" | "none" | "error";
  hintText: string | null;
  checkedAt: string | null;
};


export type UpgradeFinderOverride = {
  mediaType: "movie" | "tv";
  mediaId: number;
  ignore4k: boolean;
  updatedAt: string | null;
};


export async function listUpgradeFinderHints(): Promise<UpgradeFinderHint[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT media_type, media_id, status, hint_text, checked_at
     FROM upgrade_finder_hint
     ORDER BY checked_at DESC`
  );
  return res.rows.map((row) => ({
    mediaType: row.media_type,
    mediaId: Number(row.media_id),
    status: row.status,
    hintText: row.hint_text ?? null,
    checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null
  }));
}


export async function upsertUpgradeFinderHint(input: {
  mediaType: "movie" | "tv";
  mediaId: number;
  status: "available" | "none" | "error";
  hintText?: string | null;
}) {
  await ensureSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO upgrade_finder_hint (media_type, media_id, status, hint_text, checked_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (media_type, media_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      hint_text = EXCLUDED.hint_text,
      checked_at = EXCLUDED.checked_at
    `,
    [input.mediaType, input.mediaId, input.status, input.hintText ?? null]
  );
}


export async function listUpgradeFinderOverrides(): Promise<UpgradeFinderOverride[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT media_type, media_id, ignore_4k, updated_at
     FROM upgrade_finder_override
     ORDER BY updated_at DESC`
  );
  return res.rows.map((row) => ({
    mediaType: row.media_type,
    mediaId: Number(row.media_id),
    ignore4k: !!row.ignore_4k,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  }));
}


export async function upsertUpgradeFinderOverride(input: {
  mediaType: "movie" | "tv";
  mediaId: number;
  ignore4k: boolean;
}) {
  await ensureSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO upgrade_finder_override (media_type, media_id, ignore_4k, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (media_type, media_id)
    DO UPDATE SET
      ignore_4k = EXCLUDED.ignore_4k,
      updated_at = EXCLUDED.updated_at
    `,
    [input.mediaType, input.mediaId, input.ignore4k]
  );
}
