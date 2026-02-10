import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash, getWeeklyDigestPreference, setWeeklyDigestPreference } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { z } from "zod";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  enabled: z.boolean(),
});

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const enabled = await getWeeklyDigestPreference(dbUser.id);
  return NextResponse.json({ enabled: !!enabled, email: dbUser.email ?? null });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let body: z.infer<typeof UpdateSchema>;
  try {
    body = UpdateSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("[API] Invalid weekly digest payload", { issues: error.issues });
    } else {
      logger.warn("[API] Invalid weekly digest payload", { error });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.enabled && !dbUser.email) {
    return NextResponse.json({ error: "Add an email address to enable weekly digests." }, { status: 400 });
  }

  await setWeeklyDigestPreference(dbUser.id, body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
