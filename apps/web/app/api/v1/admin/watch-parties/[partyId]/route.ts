import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { deleteWatchPartyById, endWatchPartyAsAdmin } from "@/db/watch-party";

const ParamsSchema = z.object({
  partyId: z.string().uuid(),
});

const PatchSchema = z.object({
  action: z.enum(["end"]),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> | { partyId: string } }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const resolved = await Promise.resolve(params);
  const parsed = ParamsSchema.safeParse(resolved);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid party ID" }, { status: 400 });
  }

  const deleted = await deleteWatchPartyById(parsed.data.partyId);
  if (!deleted) {
    return NextResponse.json({ error: "Watch party not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> | { partyId: string } }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const resolved = await Promise.resolve(params);
  const parsed = ParamsSchema.safeParse(resolved);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid party ID" }, { status: 400 });
  }

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (body.action === "end") {
    const ended = await endWatchPartyAsAdmin(parsed.data.partyId);
    if (!ended) {
      return NextResponse.json({ error: "Watch party is not active or not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
