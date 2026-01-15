import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { getUserWithHash, isSessionActive, touchUserSession } from "@/db";
import { withCache } from "@/lib/local-cache";

export type AppUser = {
  username: string;
  groups: string[];
  isAdmin: boolean;
};

function splitGroups(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/g)
    .map(s => s.trim())
    .filter(Boolean);
}

export async function getUser(): Promise<AppUser> {
  const devUser = process.env.DEV_USER?.trim();
  const devGroups = process.env.DEV_GROUPS?.trim();
  const allowDevBypass = process.env.ALLOW_DEV_BYPASS === "1";

  const adminGroup = (process.env.AUTH_ADMIN_GROUP ?? "admins").toLowerCase();

  if (devUser) {
    if (process.env.NODE_ENV === "production" && !allowDevBypass) {
      throw new Error("DEV_USER is disabled in production. Unset DEV_USER or set ALLOW_DEV_BYPASS=1 to override.");
    }
    const groups = splitGroups(devGroups);
    return { username: devUser, groups, isAdmin: groups.map(g => g.toLowerCase()).includes(adminGroup) };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("lemedia_session")?.value ?? "";
  
  if (process.env.AUTH_DEBUG === "1") {
    console.log("[AUTH] sessionToken present:", !!sessionToken);
    console.log("[AUTH] sessionToken length:", sessionToken?.length || 0);
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
          username: u.username,
          groups: u.groups,
          isAdmin: u.groups.map(g => g.toLowerCase()).includes(adminGroup),
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
    console.log("[AUTH] session verified:", !!session);
    console.log("[AUTH] username:", username || "(none)");
    console.log("[AUTH] groups:", groups);
  }

  return { username, groups, isAdmin };
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
      httpOnly: false,
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
