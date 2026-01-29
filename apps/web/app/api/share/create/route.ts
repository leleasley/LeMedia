import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { createMediaShare, countRecentSharesByUser, upsertUser } from "@/db";
import { z } from "zod";
import crypto from "crypto";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { resolvePublicBaseUrl } from "@/lib/server-utils";
import { hashSharePassword } from "@/lib/share-auth";
import { requireCsrf } from "@/lib/csrf";

const createShareSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().positive(),
  expiresIn: z.enum(["1h", "24h", "48h", "7d", "30d", "never"]),
  password: z.string().trim().max(128).optional().nullable(),
  maxViews: z.number().int().positive().optional().nullable(),
});

const RATE_LIMIT_MAX = 10; // 10 shares per hour
const RATE_LIMIT_WINDOW = 60; // minutes

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const { id: userId } = await upsertUser(user.username, user.groups);
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    // Rate limiting
    const recentShareCount = await countRecentSharesByUser(userId, RATE_LIMIT_WINDOW);
    if (recentShareCount >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} shares per hour.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const data = createShareSchema.parse(body);
    const password = data.password?.trim() ?? "";
    const passwordHash = password ? hashSharePassword(password) : null;

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    // Calculate expiration
    let expiresAt: Date | null = null;
    if (data.expiresIn !== "never") {
      expiresAt = new Date();
      switch (data.expiresIn) {
        case "1h":
          expiresAt.setHours(expiresAt.getHours() + 1);
          break;
        case "24h":
          expiresAt.setHours(expiresAt.getHours() + 24);
          break;
        case "48h":
          expiresAt.setHours(expiresAt.getHours() + 48);
          break;
        case "7d":
          expiresAt.setDate(expiresAt.getDate() + 7);
          break;
        case "30d":
          expiresAt.setDate(expiresAt.getDate() + 30);
          break;
      }
    }

    const share = await createMediaShare({
      token,
      mediaType: data.mediaType,
      tmdbId: data.tmdbId,
      createdBy: userId,
      expiresAt,
      passwordHash,
      maxViews: data.maxViews ?? null,
    });

    const baseUrl = resolvePublicBaseUrl(req);
    const shareUrl = `${baseUrl}/share/${share.id}`;

    // Log the share creation
    await logAuditEvent({
      action: "media_share.created",
      actor: user.username,
      target: `${data.mediaType}:${data.tmdbId}`,
      metadata: {
        shareId: share.id,
        expiresAt: expiresAt?.toISOString() ?? "never",
        mediaType: data.mediaType,
        tmdbId: data.tmdbId,
      },
      ip: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      id: share.id,
      token: share.token,
      url: shareUrl,
      expiresAt: share.expiresAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }
    console.error("Error creating share:", error);
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}
