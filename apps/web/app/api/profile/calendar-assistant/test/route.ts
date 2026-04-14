import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getCalendarAssistantPreference, getUserWithHash } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { sendCalendarAssistantToUser } from "@/lib/jobs/calendar-assistant";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const pref = await getCalendarAssistantPreference(dbUser.id);

  try {
    await sendCalendarAssistantToUser(dbUser.id, pref.channels);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to send test digest" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
