import { getPool } from "./core";

export type RequestLifecycleEventType =
  | "requested"
  | "auto_approved"
  | "submitted_to_service"
  | "downloading"
  | "partially_available"
  | "available"
  | "already_exists"
  | "denied"
  | "failed"
  | "removed"
  | "issue_reported";

export type RequestLifecycleEventRecord = {
  requestId: string;
  eventType: RequestLifecycleEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RequestTimelineSnapshot = {
  items: Array<{
    id: number;
    provider: "sonarr" | "radarr";
    providerId: number | null;
    season: number | null;
    episode: number | null;
    status: string;
    createdAt: string;
  }>;
  events: RequestLifecycleEventRecord[];
  issues: Array<{
    id: string;
    category: string;
    status: string;
    createdAt: string;
  }>;
};

let ensureRequestLifecycleSchemaPromise: Promise<void> | null = null;

export async function ensureRequestLifecycleSchema() {
  if (ensureRequestLifecycleSchemaPromise) return ensureRequestLifecycleSchemaPromise;
  ensureRequestLifecycleSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS request_lifecycle_event (
        id BIGSERIAL PRIMARY KEY,
        request_id UUID NOT NULL REFERENCES media_request(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK (
          event_type IN (
            'requested','auto_approved','submitted_to_service','downloading','partially_available',
            'available','already_exists','denied','failed','removed','issue_reported'
          )
        ),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_request_lifecycle_event_request_id ON request_lifecycle_event(request_id, created_at ASC);`);
  })();
  return ensureRequestLifecycleSchemaPromise;
}

export async function logRequestLifecycleEvent(input: {
  requestId: string;
  eventType: RequestLifecycleEventType;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}) {
  await ensureRequestLifecycleSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO request_lifecycle_event (request_id, event_type, metadata, created_at)
    VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, NOW()))
    `,
    [input.requestId, input.eventType, JSON.stringify(input.metadata ?? {}), input.occurredAt ?? null]
  );
}

export async function logIssueReportedForMatchingRequests(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  issueId: string;
  category: string;
  createdAt?: string;
}) {
  await ensureRequestLifecycleSchema();
  const p = getPool();
  const requestType = input.mediaType === "movie" ? "movie" : "episode";
  const res = await p.query(
    `
    SELECT id
    FROM media_request
    WHERE request_type = $1
      AND tmdb_id = $2
      AND status IN ('submitted','downloading','partially_available','available','already_exists','removed')
    `,
    [requestType, input.tmdbId]
  );

  await Promise.all(
    res.rows.map((row) =>
      logRequestLifecycleEvent({
        requestId: String(row.id),
        eventType: "issue_reported",
        metadata: { issueId: input.issueId, category: input.category },
        occurredAt: input.createdAt,
      })
    )
  );
}

export async function listRequestTimelineSnapshots(requests: Array<{
  id: string;
  request_type: string;
  tmdb_id: number;
  created_at: string;
}>) {
  await ensureRequestLifecycleSchema();
  const requestIds = requests.map((request) => request.id);
  const byRequest = new Map<string, RequestTimelineSnapshot>();

  for (const request of requests) {
    byRequest.set(request.id, { items: [], events: [], issues: [] });
  }

  if (!requestIds.length) return byRequest;

  const p = getPool();
  const [itemRes, eventRes, issueRes] = await Promise.all([
    p.query(
      `
      SELECT request_id, id, provider, provider_id, season, episode, status, created_at
      FROM request_item
      WHERE request_id = ANY($1::uuid[])
      ORDER BY request_id ASC, id ASC
      `,
      [requestIds]
    ),
    p.query(
      `
      SELECT request_id, event_type, metadata, created_at
      FROM request_lifecycle_event
      WHERE request_id = ANY($1::uuid[])
      ORDER BY request_id ASC, created_at ASC, id ASC
      `,
      [requestIds]
    ),
    p.query(
      `
      SELECT
        r.id AS request_id,
        mi.id,
        mi.category,
        mi.status,
        mi.created_at
      FROM media_request r
      JOIN media_issue mi
        ON mi.tmdb_id = r.tmdb_id
       AND mi.media_type = CASE WHEN r.request_type = 'movie' THEN 'movie' ELSE 'tv' END
       AND mi.created_at >= r.created_at
      WHERE r.id = ANY($1::uuid[])
      ORDER BY r.id ASC, mi.created_at ASC
      `,
      [requestIds]
    ),
  ]);

  for (const row of itemRes.rows) {
    const target = byRequest.get(String(row.request_id));
    if (!target) continue;
    target.items.push({
      id: Number(row.id),
      provider: row.provider === "sonarr" ? "sonarr" : "radarr",
      providerId: row.provider_id !== null ? Number(row.provider_id) : null,
      season: row.season !== null ? Number(row.season) : null,
      episode: row.episode !== null ? Number(row.episode) : null,
      status: String(row.status),
      createdAt: String(row.created_at),
    });
  }

  for (const row of eventRes.rows) {
    const target = byRequest.get(String(row.request_id));
    if (!target) continue;
    target.events.push({
      requestId: String(row.request_id),
      eventType: row.event_type as RequestLifecycleEventType,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      createdAt: String(row.created_at),
    });
  }

  for (const row of issueRes.rows) {
    const target = byRequest.get(String(row.request_id));
    if (!target) continue;
    target.issues.push({
      id: String(row.id),
      category: String(row.category),
      status: String(row.status),
      createdAt: String(row.created_at),
    });
  }

  return byRequest;
}