import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getApprovalRuleById, updateApprovalRule, deleteApprovalRule } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const UpdateRuleBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (!Number.isFinite(ruleId)) {
    return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
  }

  const rule = await getApprovalRuleById(ruleId);
  if (!rule) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  return NextResponse.json({ rule });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (!Number.isFinite(ruleId)) {
    return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
  }

  const body = UpdateRuleBody.parse(await req.json());

  const existing = await getApprovalRuleById(ruleId);
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await updateApprovalRule(ruleId, body);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (!Number.isFinite(ruleId)) {
    return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
  }

  const existing = await getApprovalRuleById(ruleId);
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await deleteApprovalRule(ruleId);

  return NextResponse.json({ ok: true });
}
