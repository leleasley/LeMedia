import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMediaShareById } from "@/db";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { signShareAccess, verifySharePassword } from "@/lib/share-auth";
import { checkLockout, clearFailures, getClientIp, recordFailure, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const authSchema = z.object({
  id: z.number().int().positive(),
  password: z.string().trim().min(1).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    const body = await req.json();
    const data = authSchema.parse(body);

    const share = await getMediaShareById(data.id);
    if (!share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Share expired" }, { status: 410 });
    }

    if (share.maxViews && share.viewCount >= share.maxViews) {
      return NextResponse.json({ error: "View limit reached" }, { status: 410 });
    }

    if (!share.passwordHash) {
      return NextResponse.json({ ok: true });
    }

    const lockKey = `share-auth:${share.id}:${ip}`;
    const lockout = checkLockout(lockKey, { windowMs: 60 * 60 * 1000, max: 5, banMs: 60 * 60 * 1000 });
    if (lockout.locked) {
      return rateLimitResponse(lockout.retryAfterSec);
    }

    if (!verifySharePassword(data.password, share.passwordHash)) {
      const failure = recordFailure(lockKey, { windowMs: 60 * 60 * 1000, max: 5, banMs: 60 * 60 * 1000 });
      if (failure.locked) {
        return rateLimitResponse(failure.retryAfterSec);
      }
      return NextResponse.json({ error: "Invalid password" }, { status: 403 });
    }

    clearFailures(lockKey);
    const token = signShareAccess(share.id, share.passwordHash);
    const ctx = getRequestContext(req);
    const cookieBase = getCookieBase(ctx, true);
    const res = NextResponse.json({ ok: true });

    const maxAgeSeconds = share.expiresAt
      ? Math.max(0, Math.floor((new Date(share.expiresAt).getTime() - Date.now()) / 1000))
      : 60 * 60 * 24 * 30;
    if (maxAgeSeconds <= 0) {
      return NextResponse.json({ error: "Share expired" }, { status: 410 });
    }

    res.cookies.set(`lemedia_share_${share.id}`, token, { ...cookieBase, maxAge: maxAgeSeconds });
    return res;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }
    logger.error("Error validating share password", error);
    return NextResponse.json({ error: "Failed to validate share password" }, { status: 500 });
  }
}
