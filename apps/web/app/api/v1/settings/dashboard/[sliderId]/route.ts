import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { deleteCustomDashboardSliderForUser, updateCustomDashboardSliderForUser, upsertUser } from "@/db";

const bodySchema = z.object({
  type: z.coerce.number().int(),
  title: z.string().trim().min(1).max(80),
  data: z.string().trim().min(1).max(200),
});

export async function PUT(req: NextRequest, ctx: { params: Promise<{ sliderId: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id: userId } = await upsertUser(user.username, user.groups);

  const { sliderId } = await ctx.params;
  const id = Number(sliderId);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid slider id" }, { status: 400 });

  try {
    const body = bodySchema.parse(await req.json());
    const updated = await updateCustomDashboardSliderForUser(userId, id, { type: body.type, title: body.title, data: body.data });
    if (!updated) return NextResponse.json({ error: "Slider not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      console.warn("[API] Invalid dashboard slider payload", { issues: e.issues });
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update slider" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ sliderId: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id: userId } = await upsertUser(user.username, user.groups);

  const { sliderId } = await ctx.params;
  const id = Number(sliderId);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid slider id" }, { status: 400 });

  const ok = await deleteCustomDashboardSliderForUser(userId, id);
  if (!ok) return NextResponse.json({ error: "Slider not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
