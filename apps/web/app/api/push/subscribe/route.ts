import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { savePushSubscription, deletePushSubscription, getUserPushSubscriptions, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const dbUser = await upsertUser(user.username, user.groups);
  const subscriptions = await getUserPushSubscriptions(dbUser.id);

  return NextResponse.json({ subscriptions });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  // Reject iOS subscriptions
  const userAgent = req.headers.get("user-agent") ?? "";
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && /safari/i.test(userAgent))) {
    return NextResponse.json(
      { error: "Web Push notifications are not supported on iOS" },
      { status: 400 }
    );
  }

  const body = SubscribeBody.parse(await req.json());
  const dbUser = await upsertUser(user.username, user.groups);

  const result = await savePushSubscription({
    userId: dbUser.id,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent,
  });

  return NextResponse.json({ ok: true, subscriptionId: result.id });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  const dbUser = await upsertUser(user.username, user.groups);
  await deletePushSubscription(dbUser.id, endpoint);

  return NextResponse.json({ ok: true });
}
