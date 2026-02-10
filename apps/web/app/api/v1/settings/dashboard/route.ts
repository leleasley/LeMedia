import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { listDashboardSlidersForUser, updateDashboardSlidersForUser, upsertUser } from "@/db";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";
import { requireCsrf } from "@/lib/csrf";

const sliderSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  type: z.coerce.number().int(),
  title: z.string().nullable().optional(),
  data: z.string().nullable().optional(),
  enabled: z.coerce.boolean(),
  order: z.coerce.number().int().optional(),
  isBuiltIn: z.coerce.boolean().optional(),
});

const bodySchema = z.array(sliderSchema);

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id: userId } = await upsertUser(user.username, user.groups);
  const sliders = await listDashboardSlidersForUser(userId);
  return cacheableJsonResponseWithETag(req, sliders, { maxAge: 0, sMaxAge: 0, private: true });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id: userId } = await upsertUser(user.username, user.groups);
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  try {
    const parsed = bodySchema.parse(await req.json());
    await updateDashboardSlidersForUser(
      userId,
      parsed.map((s, idx) => ({
        id: s.id ?? -1 - idx,
        type: s.type,
        title: s.title ?? null,
        data: s.data ?? null,
        enabled: !!s.enabled,
        order: s.order ?? idx,
        isBuiltIn: !!s.isBuiltIn,
      }))
    );
    const sliders = await listDashboardSlidersForUser(userId);
    return NextResponse.json(sliders);
  } catch (e) {
    if (e instanceof z.ZodError) {
      console.warn("[API] Invalid dashboard settings payload", { issues: e.issues });
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update dashboard settings" }, { status: 500 });
  }
}
