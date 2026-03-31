import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { getUserWithHash, getSettingInt } from "@/db";
import { isSessionActive, touchUserSession } from "@/db/sessions";
import { withCache } from "@/lib/local-cache";
import { logger } from "@/lib/logger";
import { isAdminGroup, normalizeGroupList } from "@/lib/groups";
import { resolveCookieDomain } from "@/lib/server-utils";

// Warn if debug mode is enabled in production
if (process.env.NODE_ENV === "production" && process.env.AUTH_DEBUG === "1") {
  logger.warn("⚠️  AUTH_DEBUG is enabled in production! This may leak sensitive information.");
}

if (process.env.NODE_ENV === "production") {
  const devUser = process.env.DEV_USER?.trim();
  const allowDevBypass = process.env.ALLOW_DEV_BYPASS === "1";
  if (devUser || allowDevBypass) {
    throw new Error("DEV_USER / ALLOW_DEV_BYPASS must not be set in production.");
  }
}

export type AppUser = {
  id: number;
  username: string;
  displayName: string | null;
  jellyfinUserId: string | null;
  groups: string[];
  isAdmin: boolean;
};

export async function getUser(): Promise<AppUser> {
  const devUser = process.env.DEV_USER?.trim();
  const devGroups = process.env.DEV_GROUPS?.trim();
  const allowDevBypass = process.env.ALLOW_DEV_BYPASS === "1";

  if (devUser) {
    if (process.env.NODE_ENV === "production" && !allowDevBypass) {
      throw new Error("DEV_USER is disabled in production. Unset DEV_USER or set ALLOW_DEV_BYPASS=1 to override.");
    }
    const groups = normalizeGroupList(devGroups);
    return { id: 0, username: devUser, displayName: null, jellyfinUserId: null, groups, isAdmin: isAdminGroup(groups) };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("lemedia_session")?.value ?? "";

  // Debug logging - only in development, never in production
  if (process.env.AUTH_DEBUG === "1" && process.env.NODE_ENV !== "production") {
    logger.debug("[AUTH] sessionToken present", { present: !!sessionToken });
    logger.debug("[AUTH] sessionToken length", { length: sessionToken?.length || 0 });
  }

  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  const username = session?.username ?? "";

  if (!username) {
    throw new Error("Unauthorized");
  }

  if (!session || !session.jti || !(await isSessionActive(session.jti))) {
    throw new Error("Unauthorized");
  }
  // Extend expires_at on every touch (sliding window). Cache the setting for 60s to avoid
  // an extra DB round-trip on every request.
  const defaultMaxAge = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
  const sessionMaxAge = await withCache("setting:session_max_age", 60 * 1000, () =>
    getSettingInt("session_max_age", defaultMaxAge)
  );
  await touchUserSession(session.jti, sessionMaxAge);

  // Verify user against DB and refresh groups (cached for 1 min)
  const dbUser = await withCache(`user_check:${username}`, 60 * 1000, async () => {
    const u = await getUserWithHash(username);
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name ?? null,
      jellyfinUserId: u.jellyfin_user_id ?? null,
      groups: normalizeGroupList(u.groups),
      isAdmin: isAdminGroup(u.groups),
      banned: !!u.banned
    };
  });

  if (!dbUser) {
    // User deleted or not found in DB
    throw new Error("Unauthorized");
  }

  if (dbUser.banned) {
    throw new Error("Account suspended");
  }

  const { groups, isAdmin } = dbUser;

  if (process.env.AUTH_DEBUG === "1" && process.env.NODE_ENV !== "production") {
    logger.debug("[AUTH] session verified", { verified: !!session });
    logger.debug("[AUTH] username", { username: username || "(none)" });
    logger.debug("[AUTH] groups", { groups });
  }

  return { id: dbUser.id, username, displayName: dbUser.displayName ?? null, jellyfinUserId: dbUser.jellyfinUserId ?? null, groups, isAdmin };
}

export async function requireUser(): Promise<AppUser | NextResponse> {
  try {
    return await getUser();
  } catch {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const secure = process.env.NODE_ENV === "production";
    const appBaseUrl = process.env.APP_BASE_URL?.trim();
    const cookieDomain = appBaseUrl ? resolveCookieDomain(appBaseUrl) : undefined;
    const cookieBase = {
      path: "/",
      sameSite: "lax" as const,
      secure,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };

    res.cookies.set("lemedia_session_reset", "1", {
      ...cookieBase,
      httpOnly: false,
      maxAge: 300
    });
    res.cookies.set("lemedia_session", "", {
      ...cookieBase,
      httpOnly: true,
      maxAge: 0
    });

    if (cookieDomain) {
      res.cookies.set("lemedia_session", "", {
        path: "/",
        sameSite: "lax",
        secure,
        httpOnly: true,
        maxAge: 0
      });
    }

    return res;
  }
}

export async function requireAdmin(): Promise<AppUser | NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}
