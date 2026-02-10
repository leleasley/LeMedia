import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { addUserPasswordHistory, getUserPasswordHistory, getUserTraktTokenStatus, getUserWithHash, updateUserPasswordById, updateUserProfile } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/auth-utils";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { getPasswordPolicyResult } from "@/lib/password-policy";

const UpdateSchema = z.object({
  username: z.string().trim().min(1).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  newPassword: z.string().min(8).optional(),
  currentPassword: z.string().min(1).optional(),
  discordUserId: z
    .union([z.string().trim().regex(/^\d+$/), z.literal("")])
    .optional(),
  letterboxdUsername: z
    .union([z.string().trim().regex(/^[a-zA-Z0-9._-]+$/), z.literal("")])
    .optional(),
  traktUsername: z
    .union([z.string().trim().regex(/^[a-zA-Z0-9._-]+$/), z.literal("")])
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

    const traktStatus = await getUserTraktTokenStatus(dbUser.id);

    return cacheableJsonResponseWithETag(req, {
      user: {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        jellyfinUserId: dbUser.jellyfin_user_id,
        jellyfinUsername: dbUser.jellyfin_username,
        discordUserId: dbUser.discord_user_id,
        letterboxdUsername: dbUser.letterboxd_username,
        traktUsername: dbUser.trakt_username,
        traktLinked: traktStatus.linked,
        traktTokenExpiresAt: traktStatus.expiresAt,
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
      if (error instanceof z.ZodError) {
        console.warn("[API] Invalid profile update payload", { issues: error.issues });
      } else {
        console.warn("[API] Invalid profile update payload", { error });
      }
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!body.username && body.username !== "" && !body.email && !body.newPassword && body.discordUserId === undefined && body.letterboxdUsername === undefined && body.traktUsername === undefined && body.discoverRegion === undefined && body.originalLanguage === undefined && body.watchlistSyncMovies === undefined && body.watchlistSyncTv === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const updates: { username?: string; email?: string | null; discordUserId?: string | null; letterboxdUsername?: string | null; traktUsername?: string | null; discoverRegion?: string | null; originalLanguage?: string | null; watchlistSyncMovies?: boolean; watchlistSyncTv?: boolean } = {};
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
    if (body.letterboxdUsername !== undefined) {
      const trimmed = body.letterboxdUsername.trim();
      updates.letterboxdUsername = trimmed === "" ? null : trimmed;
    }
    if (body.traktUsername !== undefined) {
      const trimmed = body.traktUsername.trim();
      updates.traktUsername = trimmed === "" ? null : trimmed;
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
      if (!dbUser.password_hash || !(await verifyPassword(body.currentPassword, dbUser.password_hash))) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
      const newPassword = body.newPassword ?? "";
      const policy = getPasswordPolicyResult({ password: newPassword, username: dbUser.username });
      if (policy.errors.length) {
        return NextResponse.json({ error: policy.errors[0] }, { status: 400 });
      }
      const history = await getUserPasswordHistory(dbUser.id);
      const hashes = [dbUser.password_hash, ...history].filter((hash): hash is string => typeof hash === "string" && hash.length > 0);
      const checks = await Promise.all(hashes.map(hash => verifyPassword(newPassword, hash)));
      const reused = checks.some(Boolean);
      if (reused) {
        return NextResponse.json({ error: "Password cannot be reused" }, { status: 400 });
      }
      const passwordHash = await hashPassword(newPassword);
      await updateUserPasswordById(dbUser.id, passwordHash);
      await addUserPasswordHistory(dbUser.id, passwordHash);
      
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
    const nextLetterboxdUsername = updates.letterboxdUsername !== undefined ? updates.letterboxdUsername : dbUser.letterboxd_username;
    const nextTraktUsername = updates.traktUsername !== undefined ? updates.traktUsername : dbUser.trakt_username;

    return NextResponse.json({
      user: {
        username: nextUsername,
        email: nextEmail,
        discordUserId: nextDiscordUserId,
        letterboxdUsername: nextLetterboxdUsername,
        traktUsername: nextTraktUsername,
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
