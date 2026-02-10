import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { getUserWithHash, isSessionActive, touchUserSession } from "@/db";
import { withCache } from "@/lib/local-cache";
import { logger } from "@/lib/logger";
import { isAdminGroup, normalizeGroupList } from "@/lib/groups";

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
    return { id: 0, username: devUser, groups, isAdmin: isAdminGroup(groups) };
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
  await touchUserSession(session.jti);

  // Verify user against DB and refresh groups (cached for 1 min)
  const dbUser = await withCache(`user_check:${username}`, 60 * 1000, async () => {
    const u = await getUserWithHash(username);
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
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

  if (process.env.AUTH_DEBUG === "1") {
    logger.debug("[AUTH] session verified", { verified: !!session });
    logger.debug("[AUTH] username", { username: username || "(none)" });
    logger.debug("[AUTH] groups", { groups });
  }

  return { id: dbUser.id, username, groups, isAdmin };
}

export async function requireUser(): Promise<AppUser | NextResponse> {
  try {
    return await getUser();
  } catch {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set("lemedia_session_reset", "1", {
      path: "/",
      sameSite: "lax",
      secure,
      httpOnly: true,
      maxAge: 300
    });
    res.cookies.set("lemedia_session", "", {
      path: "/",
      sameSite: "lax",
      secure,
      httpOnly: true,
      maxAge: 0
    });
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
