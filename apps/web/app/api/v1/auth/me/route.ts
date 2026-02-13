import { NextRequest, NextResponse } from "next/server";
import { extractExternalApiKey, getExternalApiAuth } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getUserById, getUserRequestStats, listUsers } from "@/db";
import { isAdminGroup } from "@/lib/groups";
import { getUser } from "@/auth";

function extractApiKey(req: NextRequest) {
  return extractExternalApiKey(req);
}

type ApiUserInfo = {
  id: number;
  username: string;
  displayName?: string | null;
  email: string | null;
  groups: string[];
  createdAt: string | null;
  lastSeenAt: string | null;
  avatarUrl?: string | null;
  requestCount?: number;
  movieQuotaLimit?: number | null;
  movieQuotaDays?: number | null;
  tvQuotaLimit?: number | null;
  tvQuotaDays?: number | null;
};

async function resolveExternalApiUser(req: NextRequest, fallbackUserId?: number | null): Promise<ApiUserInfo | null> {
  if (fallbackUserId && Number.isFinite(fallbackUserId)) {
    const user = await getUserById(Number(fallbackUserId));
    if (user) {
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName ?? null,
        email: user.email ?? null,
        groups: user.groups,
        createdAt: user.created_at ?? null,
        lastSeenAt: user.last_seen_at ?? null,
        avatarUrl: null
      };
    }
  }
  const apiUserHeader = req.headers.get("x-api-user") || "";
  const apiUserId = Number(apiUserHeader);
  if (Number.isFinite(apiUserId) && apiUserId > 0) {
    const user = await getUserById(apiUserId);
    if (user) {
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName ?? null,
        email: user.email ?? null,
        groups: user.groups,
        createdAt: user.created_at ?? null,
        lastSeenAt: user.last_seen_at ?? null,
        avatarUrl: null
      };
    }
  }

  const users = await listUsers();
  const admin = users.find(u => isAdminGroup(u.groups));
  const selected = admin ?? users[0] ?? null;
  if (!selected) return null;
  return {
    id: selected.id,
    username: selected.username,
    displayName: selected.displayName ?? null,
    email: selected.email ?? null,
    groups: selected.groups,
    createdAt: selected.created_at ?? null,
    lastSeenAt: selected.last_seen_at ?? null,
    avatarUrl: selected.avatarUrl ?? null
  };
}

function toSeerrUser(user: ApiUserInfo | null) {
  if (!user) return null;
  const isAdmin = isAdminGroup(user.groups);
  const permissions = isAdmin ? 2 : (32 | 262144 | 524288);
  return {
    id: user.id,
    email: user.email ?? null,
    username: user.username,
    displayName: user.displayName ?? user.username,
    permissions,
    avatar: user.avatarUrl ?? null,
    createdAt: user.createdAt,
    updatedAt: user.lastSeenAt ?? user.createdAt,
    isAdmin,
    requestCount: user.requestCount ?? 0,
    movieQuotaLimit: user.movieQuotaLimit ?? null,
    movieQuotaDays: user.movieQuotaDays ?? null,
    tvQuotaLimit: user.tvQuotaLimit ?? null,
    tvQuotaDays: user.tvQuotaDays ?? null,
  };
}

export async function GET(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const auth = apiKey ? await getExternalApiAuth(apiKey) : { ok: false, isGlobal: false, userId: null };
  if (auth.ok) {
    const user = await resolveExternalApiUser(req, auth.userId ?? null);
    if (!user) {
      return NextResponse.json({ error: "No users found" }, { status: 404 });
    }
    const stats = await getUserRequestStats(user.username);
    return cacheableJsonResponseWithETag(req, toSeerrUser({
      ...user,
      requestCount: stats.total,
    }), { maxAge: 0, private: true });
  }

  try {
    const sessionUser = await getUser();
    const dbUser = await getUserById(sessionUser.id);
    if (!dbUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const mapped: ApiUserInfo = {
      id: dbUser.id,
      username: dbUser.username,
      displayName: dbUser.displayName ?? null,
      email: dbUser.email ?? null,
      groups: dbUser.groups,
      createdAt: dbUser.created_at ?? null,
      lastSeenAt: dbUser.last_seen_at ?? null,
      avatarUrl: null,
      movieQuotaLimit: dbUser.requestLimitMovie ?? null,
      movieQuotaDays: dbUser.requestLimitMovieDays ?? null,
      tvQuotaLimit: dbUser.requestLimitSeries ?? null,
      tvQuotaDays: dbUser.requestLimitSeriesDays ?? null,
    };
    const stats = await getUserRequestStats(dbUser.username);
    return cacheableJsonResponseWithETag(req, toSeerrUser({
      ...mapped,
      requestCount: stats.total,
    }), { maxAge: 0, private: true });
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
