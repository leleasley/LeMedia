import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash, updateUserPasswordById, updateUserProfile } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/auth-utils";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

const UpdateSchema = z.object({
  username: z.string().trim().min(1).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  newPassword: z.string().min(6).optional(),
  currentPassword: z.string().min(1).optional(),
  discordUserId: z
    .union([z.string().trim().regex(/^\d+$/), z.literal("")])
    .optional(),
  discoverRegion: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  watchlistSyncMovies: z.boolean().optional(),
  watchlistSyncTv: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;

    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return jsonResponseWithETag(req, { error: "User not found" }, { status: 404 });

    return cacheableJsonResponseWithETag(req, {
      user: {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        jellyfinUserId: dbUser.jellyfin_user_id,
        jellyfinUsername: dbUser.jellyfin_username,
        discordUserId: dbUser.discord_user_id,
        avatarUrl: dbUser.avatar_url,
        discoverRegion: dbUser.discover_region,
        originalLanguage: dbUser.original_language,
        watchlistSyncMovies: dbUser.watchlist_sync_movies,
        watchlistSyncTv: dbUser.watchlist_sync_tv,
        requestLimitMovie: dbUser.request_limit_movie,
        requestLimitMovieDays: dbUser.request_limit_movie_days,
        requestLimitSeries: dbUser.request_limit_series,
        requestLimitSeriesDays: dbUser.request_limit_series_days,
      }
    }, { maxAge: 0, sMaxAge: 0, private: true });
  } catch (error: any) {
    return jsonResponseWithETag(req, { error: error?.message ?? "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    let body: z.infer<typeof UpdateSchema>;
    try {
      body = UpdateSchema.parse(await req.json());
    } catch (error) {
      const message = error instanceof z.ZodError ? error.issues.map(e => e.message).join(", ") : "Invalid request body";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (!body.username && body.username !== "" && !body.email && !body.newPassword && body.discordUserId === undefined && body.discoverRegion === undefined && body.originalLanguage === undefined && body.watchlistSyncMovies === undefined && body.watchlistSyncTv === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const updates: { username?: string; email?: string | null; discordUserId?: string | null; discoverRegion?: string | null; originalLanguage?: string | null; watchlistSyncMovies?: boolean; watchlistSyncTv?: boolean } = {};
    if (body.username !== undefined && body.username.trim() && body.username.trim() !== dbUser.username) {
      updates.username = body.username.trim().toLowerCase();
    }
    if (body.email !== undefined) {
      const trimmed = body.email.trim();
      updates.email = trimmed === "" ? null : trimmed;
    }
    if (body.discordUserId !== undefined) {
      const trimmed = body.discordUserId.trim();
      updates.discordUserId = trimmed === "" ? null : trimmed;
    }
    if (body.discoverRegion !== undefined) {
      updates.discoverRegion = body.discoverRegion;
    }
    if (body.originalLanguage !== undefined) {
      updates.originalLanguage = body.originalLanguage;
    }
    if (body.watchlistSyncMovies !== undefined) {
      updates.watchlistSyncMovies = body.watchlistSyncMovies;
    }
    if (body.watchlistSyncTv !== undefined) {
      updates.watchlistSyncTv = body.watchlistSyncTv;
    }

    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: "Enter your current password to change it" }, { status: 400 });
      }
      if (!dbUser.password_hash || !verifyPassword(body.currentPassword, dbUser.password_hash)) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
      await updateUserPasswordById(dbUser.id, hashPassword(body.newPassword));
      
      // Log password change
      await logAuditEvent({
        action: "user.password_changed",
        actor: dbUser.username,
        ip: getClientIp(req),
      });
    }

    if (Object.keys(updates).length > 0) {
      await updateUserProfile(dbUser.id, updates);
    }

    const nextUsername = updates.username ?? dbUser.username;
    const nextEmail = updates.email !== undefined ? updates.email : dbUser.email;
    const nextDiscordUserId = updates.discordUserId !== undefined ? updates.discordUserId : dbUser.discord_user_id;

    return NextResponse.json({
      user: {
        username: nextUsername,
        email: nextEmail,
        discordUserId: nextDiscordUserId,
        discoverRegion: updates.discoverRegion !== undefined ? updates.discoverRegion : dbUser.discover_region,
        originalLanguage: updates.originalLanguage !== undefined ? updates.originalLanguage : dbUser.original_language,
        watchlistSyncMovies: updates.watchlistSyncMovies !== undefined ? updates.watchlistSyncMovies : dbUser.watchlist_sync_movies,
        watchlistSyncTv: updates.watchlistSyncTv !== undefined ? updates.watchlistSyncTv : dbUser.watchlist_sync_tv,
      },
      requireLogout: !!(updates.username !== undefined || body.newPassword)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to update profile" }, { status: 500 });
  }
}