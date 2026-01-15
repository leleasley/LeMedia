import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { sendWeeklyDigestPreview } from "@/notifications/weekly-digest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!dbUser.email) {
    return NextResponse.json({ error: "Add an email address to send a test digest." }, { status: 400 });
  }

  try {
    await sendWeeklyDigestPreview({ id: dbUser.id, email: dbUser.email });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to send test digest" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
