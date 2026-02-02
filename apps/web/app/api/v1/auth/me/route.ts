import { NextRequest, NextResponse } from "next/server";
import { verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getUserById, listUsers } from "@/db";
import { isAdminGroup } from "@/lib/groups";
import { getUser } from "@/auth";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

type ApiUserInfo = {
  id: number;
  username: string;
  email: string | null;
  groups: string[];
  createdAt: string | null;
  lastSeenAt: string | null;
  avatarUrl?: string | null;
};

async function resolveExternalApiUser(req: NextRequest): Promise<ApiUserInfo | null> {
  const apiUserHeader = req.headers.get("x-api-user") || "";
  const apiUserId = Number(apiUserHeader);
  if (Number.isFinite(apiUserId) && apiUserId > 0) {
    const user = await getUserById(apiUserId);
    if (user) {
      return {
        id: user.id,
        username: user.username,
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
    displayName: user.username,
    permissions,
    avatar: user.avatarUrl ?? null,
    createdAt: user.createdAt,
    updatedAt: user.lastSeenAt ?? user.createdAt,
    isAdmin
  };
}

export async function GET(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (ok) {
    const user = await resolveExternalApiUser(req);
    if (!user) {
      return NextResponse.json({ error: "No users found" }, { status: 404 });
    }
    return cacheableJsonResponseWithETag(req, toSeerrUser(user), { maxAge: 0, private: true });
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
      email: dbUser.email ?? null,
      groups: dbUser.groups,
      createdAt: dbUser.created_at ?? null,
      lastSeenAt: dbUser.last_seen_at ?? null,
      avatarUrl: null
    };
    return cacheableJsonResponseWithETag(req, toSeerrUser(mapped), { maxAge: 0, private: true });
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
