import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { listApprovalRules, createApprovalRule } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const CreateRuleBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  ruleType: z.enum(["user_trust", "popularity", "time_based", "genre", "content_rating"]),
  conditions: z.record(z.string(), z.any()),
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const rules = await listApprovalRules();
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const body = CreateRuleBody.parse(await req.json());

  const result = await createApprovalRule({
    name: body.name,
    description: body.description,
    enabled: body.enabled,
    priority: body.priority,
    ruleType: body.ruleType,
    conditions: body.conditions,
  });

  return NextResponse.json({
    ok: true,
    ruleId: result.id,
    createdAt: result.createdAt,
  });
}
