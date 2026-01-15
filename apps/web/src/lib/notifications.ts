import { listUserNotificationEndpointIds, getPool } from "@/db";

export async function hasAssignedNotificationEndpoints(userId: number): Promise<boolean> {
  return (await listUserNotificationEndpointIds(userId)).length > 0;
}

export interface NotificationEndpoint {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  is_global: boolean;
  events: string[];
  config: Record<string, any>;
  types: number;
  created_at: Date;
}

/**
 * Get a notification endpoint by type (for global admin notifications)
 */
export async function getNotificationEndpointByType(
  type: string
): Promise<NotificationEndpoint | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT id, name, type, enabled, is_global, events, config, types, created_at 
     FROM notification_endpoint 
     WHERE type = $1 AND is_global = true 
     LIMIT 1`,
    [type]
  );

  return result.rows[0] || null;
}

/**
 * Update a notification endpoint's configuration
 */
export async function updateNotificationEndpoint(
  type: string,
  enabled: boolean,
  types: number,
  config: Record<string, any>
): Promise<NotificationEndpoint> {
  const db = getPool();
  // First, try to get existing endpoint
  const existing = await getNotificationEndpointByType(type);

  if (existing) {
    // Update existing
    const result = await db.query(
      `UPDATE notification_endpoint 
       SET enabled = $1, types = $2, config = $3
       WHERE id = $4
       RETURNING id, name, type, enabled, is_global, events, config, types, created_at`,
      [enabled, types, JSON.stringify(config), existing.id]
    );
    return result.rows[0];
  } else {
    // Create new
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} Notifications`;
    const result = await db.query(
      `INSERT INTO notification_endpoint (name, type, enabled, is_global, types, config)
       VALUES ($1, $2, $3, true, $4, $5)
       RETURNING id, name, type, enabled, is_global, events, config, types, created_at`,
      [name, type, enabled, types, JSON.stringify(config)]
    );
    return result.rows[0];
  }
}

/**
 * Get all enabled notification endpoints for a specific event type
 */
export async function getEnabledNotificationEndpoints(
  eventType: number
): Promise<NotificationEndpoint[]> {
  const db = getPool();
  const result = await db.query(
    `SELECT id, name, type, enabled, is_global, events, config, types, created_at 
     FROM notification_endpoint 
     WHERE enabled = true AND (types & $1) = $1`,
    [eventType]
  );

  return result.rows;
}

/**
 * Get all notification endpoints of a specific type (both global and non-global)
 */
export async function listNotificationEndpointsByType(
  type: string
): Promise<NotificationEndpoint[]> {
  const db = getPool();
  const result = await db.query(
    `SELECT id, name, type, enabled, is_global, events, config, types, created_at 
     FROM notification_endpoint 
     WHERE type = $1 
     ORDER BY is_global DESC, name ASC`,
    [type]
  );

  return result.rows;
}

/**
 * Get a notification endpoint by ID
 */
export async function getNotificationEndpointById(
  id: number
): Promise<NotificationEndpoint | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT id, name, type, enabled, is_global, events, config, types, created_at 
     FROM notification_endpoint 
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Create a new notification endpoint
 */
export async function createNotificationEndpoint(
  name: string,
  type: string,
  enabled: boolean,
  types: number,
  config: Record<string, any>,
  isGlobal: boolean = false
): Promise<NotificationEndpoint> {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO notification_endpoint (name, type, enabled, is_global, types, config)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, type, enabled, is_global, events, config, types, created_at`,
    [name, type, enabled, isGlobal, types, JSON.stringify(config)]
  );

  return result.rows[0];
}

/**
 * Update a notification endpoint by ID
 */
export async function updateNotificationEndpointById(
  id: number,
  name: string,
  enabled: boolean,
  types: number,
  config: Record<string, any>
): Promise<NotificationEndpoint> {
  const db = getPool();
  const result = await db.query(
    `UPDATE notification_endpoint 
     SET name = $1, enabled = $2, types = $3, config = $4
     WHERE id = $5
     RETURNING id, name, type, enabled, is_global, events, config, types, created_at`,
    [name, enabled, types, JSON.stringify(config), id]
  );

  return result.rows[0];
}

/**
 * Delete a notification endpoint by ID
 */
export async function deleteNotificationEndpoint(id: number): Promise<void> {
  const db = getPool();
  await db.query(`DELETE FROM notification_endpoint WHERE id = $1`, [id]);
}
