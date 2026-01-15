import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getUserWithHash, listUserNotificationEndpointIds } from "@/db";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const bodySchema = z.object({ endpointIds: z.array(z.coerce.number().int().positive()).default([]) });

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return new NextResponse("Unauthorized", { status: 401 });
  return jsonResponseWithETag(req, { endpointIds: await listUserNotificationEndpointIds(dbUser.id) });
}

export async function PUT(req: NextRequest) {
  return NextResponse.json(
    { error: "Notification preferences can only be managed by administrators." },
    { status: 403 }
  );
}
