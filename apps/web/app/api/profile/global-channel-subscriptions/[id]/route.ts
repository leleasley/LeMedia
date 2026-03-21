import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  addUserNotificationEndpointId,
  getNotificationEndpointByIdFull,
  listUserNotificationEndpointIds,
  setUserNotificationEndpointIds,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const bodySchema = z.object({ subscribed: z.boolean() });

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as Promise<{ id: string }>).then === "function") {
    return await (params as Promise<{ id: string }>);
  }
  return params as { id: string };
}

export async function PATCH(req: NextRequest, context: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const resolvedParams = await resolveParams(context.params);
  const idParsed = idSchema.safeParse({ id: resolvedParams.id });
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid endpoint ID" }, { status: 400 });
  }
  const endpointId = idParsed.data.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bodyParsed = bodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Verify the endpoint is actually a global endpoint
  const endpoint = await getNotificationEndpointByIdFull(endpointId);
  if (!endpoint || !endpoint.is_global || endpoint.owner_user_id != null) {
    return NextResponse.json(
      { error: "Endpoint not found or not a global endpoint" },
      { status: 404 }
    );
  }

  const dbUser = await upsertUser(user.username, user.groups);

  if (bodyParsed.data.subscribed) {
    await addUserNotificationEndpointId(dbUser.id, endpointId);
  } else {
    const currentIds = await listUserNotificationEndpointIds(dbUser.id);
    await setUserNotificationEndpointIds(
      dbUser.id,
      currentIds.filter((id) => id !== endpointId)
    );
  }

  const updatedIds = await listUserNotificationEndpointIds(dbUser.id);
  return NextResponse.json({ subscribed: updatedIds.includes(endpointId) });
}
