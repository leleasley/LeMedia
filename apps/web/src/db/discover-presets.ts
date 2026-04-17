import { getPool } from "./core";

export type DiscoverPresetRecord = {
  id: string;
  userId: number;
  mediaType: "movie" | "tv";
  name: string;
  filters: Record<string, unknown>;
  alertsEnabled: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

let ensureDiscoverPresetSchemaPromise: Promise<void> | null = null;

export async function ensureDiscoverPresetSchema() {
  if (ensureDiscoverPresetSchemaPromise) return ensureDiscoverPresetSchemaPromise;
  ensureDiscoverPresetSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS discover_preset (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        name TEXT NOT NULL,
        filters JSONB NOT NULL DEFAULT '{}'::jsonb,
        alerts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        pinned BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_discover_preset_user_id ON discover_preset(user_id, media_type, updated_at DESC);`);
    await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_discover_preset_user_name ON discover_preset(user_id, media_type, lower(name));`);
  })();
  return ensureDiscoverPresetSchemaPromise;
}

function mapRow(row: any): DiscoverPresetRecord {
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    mediaType: row.media_type === "tv" ? "tv" : "movie",
    name: String(row.name),
    filters: row.filters && typeof row.filters === "object" ? row.filters : {},
    alertsEnabled: Boolean(row.alerts_enabled),
    pinned: Boolean(row.pinned),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listDiscoverPresetsForUser(userId: number, options?: { pinnedOnly?: boolean; mediaType?: "movie" | "tv" }) {
  await ensureDiscoverPresetSchema();
  const p = getPool();
  const values: Array<number | string | boolean> = [userId];
  const clauses = ["user_id = $1"];

  if (options?.pinnedOnly) {
    values.push(true);
    clauses.push(`pinned = $${values.length}`);
  }

  if (options?.mediaType) {
    values.push(options.mediaType);
    clauses.push(`media_type = $${values.length}`);
  }

  const res = await p.query(
    `
    SELECT id, user_id, media_type, name, filters, alerts_enabled, pinned, created_at, updated_at
    FROM discover_preset
    WHERE ${clauses.join(" AND ")}
    ORDER BY pinned DESC, updated_at DESC, created_at DESC
    `,
    values
  );

  return res.rows.map(mapRow);
}

export async function createDiscoverPreset(input: {
  userId: number;
  mediaType: "movie" | "tv";
  name: string;
  filters: Record<string, unknown>;
  alertsEnabled?: boolean;
  pinned?: boolean;
}) {
  await ensureDiscoverPresetSchema();
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO discover_preset (user_id, media_type, name, filters, alerts_enabled, pinned, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
    RETURNING id, user_id, media_type, name, filters, alerts_enabled, pinned, created_at, updated_at
    `,
    [
      input.userId,
      input.mediaType,
      input.name,
      JSON.stringify(input.filters ?? {}),
      input.alertsEnabled ?? false,
      input.pinned ?? false,
    ]
  );
  return mapRow(res.rows[0]);
}

export async function updateDiscoverPreset(input: {
  id: string;
  userId: number;
  name?: string;
  filters?: Record<string, unknown>;
  alertsEnabled?: boolean;
  pinned?: boolean;
}) {
  await ensureDiscoverPresetSchema();
  const p = getPool();
  const clauses = ["updated_at = NOW()"];
  const values: Array<string | number | boolean> = [input.id, input.userId];

  if (input.name !== undefined) {
    values.push(input.name);
    clauses.push(`name = $${values.length}`);
  }
  if (input.filters !== undefined) {
    values.push(JSON.stringify(input.filters));
    clauses.push(`filters = $${values.length}::jsonb`);
  }
  if (input.alertsEnabled !== undefined) {
    values.push(input.alertsEnabled);
    clauses.push(`alerts_enabled = $${values.length}`);
  }
  if (input.pinned !== undefined) {
    values.push(input.pinned);
    clauses.push(`pinned = $${values.length}`);
  }

  const res = await p.query(
    `
    UPDATE discover_preset
    SET ${clauses.join(", ")}
    WHERE id = $1 AND user_id = $2
    RETURNING id, user_id, media_type, name, filters, alerts_enabled, pinned, created_at, updated_at
    `,
    values
  );

  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function deleteDiscoverPreset(id: string, userId: number) {
  await ensureDiscoverPresetSchema();
  const p = getPool();
  const res = await p.query(`DELETE FROM discover_preset WHERE id = $1 AND user_id = $2`, [id, userId]);
  return (res.rowCount ?? 0) > 0;
}