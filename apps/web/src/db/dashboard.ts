import { defaultDashboardSliders, DashboardSlider } from "@/lib/dashboard-sliders";
import { getPool, dashboardSliderCache, ensureSchema } from "./core";


/**
 * Eagerly initialize the database schema and seed data (jobs, tables, etc.).
 * Call this at server startup to ensure all schema and seed rows exist
 * before the job scheduler or any requests need them.
 */
export async function initializeDatabase() {
  await ensureSchema();
}


async function bootstrapDashboardSlidersForUser(userId: number) {
  const p = getPool();
  const countRes = await p.query(`SELECT COUNT(*)::int AS count FROM user_dashboard_slider WHERE user_id = $1`, [userId]);
  const count = Number(countRes.rows[0]?.count ?? 0);
  if (count > 0) return;

  await p.query("BEGIN");
  try {
    const countRes2 = await p.query(`SELECT COUNT(*)::int AS count FROM user_dashboard_slider WHERE user_id = $1`, [userId]);
    const count2 = Number(countRes2.rows[0]?.count ?? 0);
    if (count2 === 0) {
      for (const s of defaultDashboardSliders) {
        await p.query(
          `
          INSERT INTO user_dashboard_slider (user_id, type, title, data, enabled, order_index, is_builtin)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [userId, Number(s.type), s.title ?? null, s.data ?? null, !!s.enabled, s.order, !!s.isBuiltIn]
        );
      }
    }
    await p.query("COMMIT");
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}

interface DashboardSliderRow {
  id: number | string;
  type: number | string;
  title: string | null;
  data: string | null;
  enabled: boolean;
  order_index: number | string;
  is_builtin: boolean;
}

function getDashboardSliderCacheKey(userId: number) {
  return `user:${userId}`;
}

function getCachedDashboardSliders(userId: number): DashboardSlider[] | null {
  const cached = dashboardSliderCache.get<DashboardSlider[]>(getDashboardSliderCacheKey(userId));
  return cached ?? null;
}

function setCachedDashboardSliders(userId: number, sliders: DashboardSlider[]) {
  dashboardSliderCache.set(getDashboardSliderCacheKey(userId), sliders);
}

function invalidateDashboardSliderCache(userId: number) {
  dashboardSliderCache.del(getDashboardSliderCacheKey(userId));
}

function mapDashboardSliderRow(r: DashboardSliderRow): DashboardSlider {
  return {
    id: Number(r.id),
    type: Number(r.type),
    title: r.title ?? null,
    data: r.data ?? null,
    enabled: !!r.enabled,
    order: Number(r.order_index ?? 0),
    isBuiltIn: !!r.is_builtin,
  };
}

export async function listDashboardSlidersForUser(userId: number): Promise<DashboardSlider[]> {
  await ensureSchema();
  const cached = getCachedDashboardSliders(userId);
  if (cached) return cached;
  await bootstrapDashboardSlidersForUser(userId);
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, type, title, data, enabled, order_index, is_builtin
    FROM user_dashboard_slider
    WHERE user_id = $1
    ORDER BY order_index ASC, id ASC
    `,
    [userId]
  );
  const sliders = res.rows.map(mapDashboardSliderRow);
  setCachedDashboardSliders(userId, sliders);
  return sliders;
}


export async function resetDashboardSlidersForUser(userId: number): Promise<void> {
  await ensureSchema();
  const p = getPool();
  await p.query("BEGIN");
  try {
    await p.query(`DELETE FROM user_dashboard_slider WHERE user_id = $1`, [userId]);
    for (const s of defaultDashboardSliders) {
      await p.query(
        `
        INSERT INTO user_dashboard_slider (user_id, type, title, data, enabled, order_index, is_builtin)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [userId, Number(s.type), s.title ?? null, s.data ?? null, !!s.enabled, s.order, !!s.isBuiltIn]
      );
    }
    await p.query("COMMIT");
    invalidateDashboardSliderCache(userId);
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}


export async function updateDashboardSlidersForUser(userId: number, sliders: DashboardSlider[]): Promise<void> {
  await ensureSchema();
  const p = getPool();
  const existingRes = await p.query(
    `SELECT id, is_builtin FROM user_dashboard_slider WHERE user_id = $1`,
    [userId]
  );
  const existing = new Map<number, { isBuiltIn: boolean }>();
  for (const r of existingRes.rows) {
    existing.set(Number(r.id), { isBuiltIn: !!r.is_builtin });
  }

  await p.query("BEGIN");
  try {
    for (let index = 0; index < sliders.length; index++) {
      const s = sliders[index];
      const sliderId = Number(s.id);
      if (Number.isFinite(sliderId) && existing.has(sliderId)) {
        const isBuiltIn = existing.get(sliderId)!.isBuiltIn;
        if (isBuiltIn) {
          await p.query(
            `
            UPDATE user_dashboard_slider
            SET enabled = $3, order_index = $4, updated_at = NOW()
            WHERE user_id = $1 AND id = $2
            `,
            [userId, sliderId, !!s.enabled, index]
          );
        } else {
          await p.query(
            `
            UPDATE user_dashboard_slider
            SET enabled = $3, order_index = $4, type = $5, title = $6, data = $7, updated_at = NOW()
            WHERE user_id = $1 AND id = $2
            `,
            [userId, sliderId, !!s.enabled, index, Number(s.type), s.title ?? null, s.data ?? null]
          );
        }
      } else {
        await p.query(
          `
          INSERT INTO user_dashboard_slider (user_id, type, title, data, enabled, order_index, is_builtin)
          VALUES ($1, $2, $3, $4, $5, $6, false)
          `,
          [userId, Number(s.type), s.title ?? null, s.data ?? null, !!s.enabled, index]
        );
      }
    }
    await p.query("COMMIT");
    invalidateDashboardSliderCache(userId);
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}


export async function createDashboardSliderForUser(userId: number, input: { type: number; title: string; data: string }): Promise<DashboardSlider> {
  await ensureSchema();
  const p = getPool();
  const orderRes = await p.query(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM user_dashboard_slider WHERE user_id = $1`, [userId]);
  const nextOrder = Number(orderRes.rows[0]?.next_order ?? 0);
  const res = await p.query(
    `
    INSERT INTO user_dashboard_slider (user_id, type, title, data, enabled, order_index, is_builtin)
    VALUES ($1, $2, $3, $4, false, $5, false)
    RETURNING id, type, title, data, enabled, order_index, is_builtin
    `,
    [userId, Number(input.type), input.title, input.data, nextOrder]
  );
  const slider = mapDashboardSliderRow(res.rows[0]);
  invalidateDashboardSliderCache(userId);
  return slider;
}


export async function updateCustomDashboardSliderForUser(userId: number, sliderId: number, input: { type: number; title: string; data: string }): Promise<DashboardSlider | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    UPDATE user_dashboard_slider
    SET type = $3, title = $4, data = $5, updated_at = NOW()
    WHERE user_id = $1 AND id = $2 AND is_builtin = false
    RETURNING id, type, title, data, enabled, order_index, is_builtin
    `,
    [userId, sliderId, Number(input.type), input.title, input.data]
  );
  if (!res.rows.length) return null;
  const slider = mapDashboardSliderRow(res.rows[0]);
  invalidateDashboardSliderCache(userId);
  return slider;
}


export async function deleteCustomDashboardSliderForUser(userId: number, sliderId: number): Promise<boolean> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `DELETE FROM user_dashboard_slider WHERE user_id = $1 AND id = $2 AND is_builtin = false`,
    [userId, sliderId]
  );
  if ((res.rowCount ?? 0) > 0) {
    invalidateDashboardSliderCache(userId);
  }
  return (res.rowCount ?? 0) > 0;
}
