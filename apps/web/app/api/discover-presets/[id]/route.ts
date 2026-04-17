import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { deleteDiscoverPreset, getUserWithHash, updateDiscoverPreset } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.object({ id: z.number(), name: z.string() }),
]);

const UpdatePresetSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  filters: z.record(z.string(), FilterValueSchema).optional(),
  alertsEnabled: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = UpdatePresetSchema.parse(await req.json());
    const { id } = await params;
    const preset = await updateDiscoverPreset({ id, userId: dbUser.id, ...body });
    if (!preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    return NextResponse.json({ preset });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid preset update" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update preset" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const deleted = await deleteDiscoverPreset(id, dbUser.id);
    if (!deleted) return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete preset" }, { status: 500 });
  }
}