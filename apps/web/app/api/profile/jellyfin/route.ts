import { NextRequest, NextResponse } from "next/server";
import { getUser, requireUser } from "@/auth";
import { getUserByJellyfinUserId, getUserWithHash, linkUserToJellyfin, unlinkUserFromJellyfin } from "@/db";
import { getJellyfinBaseUrl, jellyfinLogin } from "@/lib/jellyfin-admin";
import { verifyMfaCode } from "@/lib/mfa-reauth";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const linkSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  mfaCode: z.string().min(1)
});

function buildDeviceId(username: string) {
  return Buffer.from(`BOT_lemedia_${username}`).toString("base64");
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return jsonResponseWithETag(req, { error: "User not found" }, { status: 404 });

  return jsonResponseWithETag(req, {
    linked: Boolean(dbUser.jellyfin_user_id),
    jellyfinUserId: dbUser.jellyfin_user_id,
    jellyfinUsername: dbUser.jellyfin_username,
    avatarUrl: dbUser.avatar_url
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: z.infer<typeof linkSchema>;
  try {
    body = linkSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      logger.warn("[API] Invalid Jellyfin profile payload", { issues: err.issues });
    } else {
      logger.warn("[API] Invalid Jellyfin profile payload", { err });
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const mfaCheck = verifyMfaCode(dbUser.mfa_secret, body.mfaCode);
  if (!mfaCheck.ok) return NextResponse.json({ error: mfaCheck.message }, { status: 400 });

  const baseUrl = await getJellyfinBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "Jellyfin not configured" }, { status: 400 });
  }

  try {
    const deviceId = dbUser.jellyfin_device_id ?? buildDeviceId(dbUser.username);
    const login = await jellyfinLogin({
      baseUrl,
      username: body.username,
      password: body.password,
      deviceId
    });

    const existingLink = await getUserByJellyfinUserId(login.userId);
    if (existingLink && existingLink.id !== dbUser.id) {
      return NextResponse.json({ error: "That Jellyfin account is already linked" }, { status: 409 });
    }

    await linkUserToJellyfin({
      userId: dbUser.id,
      jellyfinUserId: login.userId,
      jellyfinUsername: login.username,
      jellyfinDeviceId: deviceId,
      jellyfinAuthToken: login.accessToken,
      avatarUrl: `/avatarproxy/${login.userId}`
    });

    return NextResponse.json({ linked: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unable to link Jellyfin account" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await getUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  const body = await req.json().catch(() => ({}));
  const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode : "";

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const mfaCheck = verifyMfaCode(dbUser.mfa_secret, mfaCode);
  if (!mfaCheck.ok) return NextResponse.json({ error: mfaCheck.message }, { status: 400 });

  await unlinkUserFromJellyfin(dbUser.id);
  return NextResponse.json({ linked: false });
}
