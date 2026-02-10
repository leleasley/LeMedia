import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { createDashboardSliderForUser, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  type: z.coerce.number().int(),
  title: z.string().trim().min(1).max(80),
  data: z.string().trim().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id: userId } = await upsertUser(user.username, user.groups);
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  try {
    const body = bodySchema.parse(await req.json());
    const slider = await createDashboardSliderForUser(userId, { type: body.type, title: body.title, data: body.data });
    return NextResponse.json(slider);
  } catch (e) {
    if (e instanceof z.ZodError) {
      logger.warn("[API] Invalid dashboard slider payload", { issues: e.issues });
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create slider" }, { status: 500 });
  }
}
