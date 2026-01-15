import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getWebPushPreference, setWebPushPreference, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const dbUser = await upsertUser(user.username, user.groups);
  const enabled = await getWebPushPreference(dbUser.id);

  return NextResponse.json({ enabled });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { enabled } = await req.json();

  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be a boolean" },
      { status: 400 }
    );
  }

  const dbUser = await upsertUser(user.username, user.groups);
  await setWebPushPreference(dbUser.id, enabled);

  return NextResponse.json({ ok: true, enabled });
}
