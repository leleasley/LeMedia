import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getNotificationEndpointByIdFull } from "@/db";
import { sendTestNotification } from "@/notifications/test";
import { requireCsrf } from "@/lib/csrf";

const idSchema = z.object({ id: z.coerce.number().int().positive() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function POST(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const endpoint = await getNotificationEndpointByIdFull(parsed.data.id);
  if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await sendTestNotification(endpoint);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Test failed" }, { status: 500 });
  }
}
