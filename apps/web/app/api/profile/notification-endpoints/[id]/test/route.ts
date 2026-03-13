import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getNotificationEndpointByIdForOwner, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { sendTestNotification } from "@/notifications/test";

type ParamsInput = { id: string } | Promise<{ id: string }>;

const idSchema = z.object({ id: z.coerce.number().int().positive() });

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as Promise<{ id: string }>).then === "function") {
    return await (params as Promise<{ id: string }>);
  }
  return params as { id: string };
}

export async function POST(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const dbUser = await upsertUser(user.username, user.groups);
  const endpoint = await getNotificationEndpointByIdForOwner(parsed.data.id, dbUser.id);
  if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await sendTestNotification(endpoint);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Test failed" }, { status: 500 });
  }
}
