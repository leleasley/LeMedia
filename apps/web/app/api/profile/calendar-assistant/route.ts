import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  getCalendarAssistantPreference,
  getUserWithHash,
  setCalendarAssistantPreference,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  enabled: z.boolean(),
  channels: z.array(z.enum(["in_app", "telegram", "endpoints"]))
    .min(1)
    .max(3)
    .optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  hourOfDay: z.number().int().min(0).max(23).optional(),
});

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const preference = await getCalendarAssistantPreference(dbUser.id);
  return NextResponse.json(preference);
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = UpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const channels = body.data.channels ?? ["in_app"];

  const updated = await setCalendarAssistantPreference(dbUser.id, {
    enabled: body.data.enabled,
    channels,
    dayOfWeek: body.data.dayOfWeek ?? 1,
    hourOfDay: body.data.hourOfDay ?? 9,
  });

  return NextResponse.json(updated);
}
