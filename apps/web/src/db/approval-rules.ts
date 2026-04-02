import { getPool } from "./core";


// ============================================
// Auto-Approval Rules
// ============================================

export async function createApprovalRule(input: {
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  ruleType: string;
  conditions: Record<string, unknown>;
}) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO approval_rule (name, description, enabled, priority, rule_type, conditions)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [input.name, input.description ?? null, input.enabled, input.priority, input.ruleType, JSON.stringify(input.conditions)]
  );
  return {
    id: res.rows[0].id as number,
    createdAt: res.rows[0].created_at as string,
  };
}


export async function updateApprovalRule(id: number, input: {
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  conditions?: Record<string, unknown>;
}) {
  const p = getPool();
  const updates: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIdx++}`);
    values.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIdx++}`);
    values.push(input.description);
  }
  if (input.enabled !== undefined) {
    updates.push(`enabled = $${paramIdx++}`);
    values.push(input.enabled);
  }
  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIdx++}`);
    values.push(input.priority);
  }
  if (input.conditions !== undefined) {
    updates.push(`conditions = $${paramIdx++}`);
    values.push(JSON.stringify(input.conditions));
  }

  if (updates.length === 0) return;

  updates.push(`updated_at = NOW()`);
  values.push(id);

  await p.query(
    `UPDATE approval_rule SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
    values
  );
}


export async function deleteApprovalRule(id: number) {
  const p = getPool();
  await p.query(`DELETE FROM approval_rule WHERE id = $1`, [id]);
}


export async function listApprovalRules() {
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, description, enabled, priority, rule_type, conditions, created_at, updated_at
     FROM approval_rule
     ORDER BY priority DESC, created_at DESC`
  );
  return res.rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    description: r.description as string | null,
    enabled: r.enabled as boolean,
    priority: r.priority as number,
    ruleType: r.rule_type as string,
    conditions: r.conditions as Record<string, unknown>,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}


export async function getApprovalRuleById(id: number) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, description, enabled, priority, rule_type, conditions, created_at, updated_at
     FROM approval_rule
     WHERE id = $1`,
    [id]
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id as number,
    name: r.name as string,
    description: r.description as string | null,
    enabled: r.enabled as boolean,
    priority: r.priority as number,
    ruleType: r.rule_type as string,
    conditions: r.conditions as Record<string, unknown>,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}


export async function getActiveApprovalRules() {
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, rule_type, conditions, priority
     FROM approval_rule
     WHERE enabled = TRUE
     ORDER BY priority DESC`
  );
  return res.rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    ruleType: r.rule_type as string,
    conditions: r.conditions as Record<string, unknown>,
    priority: r.priority as number,
  }));
}
