import { NextResponse } from "next/server";
import { z } from "zod";

export const ApiSuccessMetaSchema = z.object({
  generatedAt: z.string(),
});

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  meta: ApiSuccessMetaSchema,
});

export function createApiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: ApiSuccessMetaSchema,
  });
}

function createMeta() {
  return { generatedAt: new Date().toISOString() };
}

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data, meta: createMeta() }, init);
}

export function apiError(error: string, init?: ResponseInit & { code?: string }) {
  const response = NextResponse.json(
    { ok: false, error, code: init?.code, meta: createMeta() },
    init
  );
  return response;
}
