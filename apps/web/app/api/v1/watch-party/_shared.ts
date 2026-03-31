import { NextRequest, NextResponse } from "next/server";
import { getUserByUsernameInsensitive, upsertUser } from "@/db";
import { requireUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";

type ResolvedWatchPartyUser =
  | {
      response: NextResponse;
      dbUser: null;
    }
  | {
      response: undefined;
      dbUser: {
        id: number;
        username: string;
      };
    };

export async function resolveDbUser(): Promise<ResolvedWatchPartyUser> {
  const user = await requireUser();
  if (user instanceof NextResponse) {
    return { response: user, dbUser: null };
  }

  const existing = await getUserByUsernameInsensitive(user.username);
  if (existing) {
    return {
      response: undefined,
      dbUser: { id: existing.id, username: existing.username ?? user.username },
    };
  }

  const created = await upsertUser(user.username, user.groups);

  return {
    response: undefined,
    dbUser: { id: created.id, username: user.username },
  };
}

export function requireWatchPartyCsrf(req: NextRequest) {
  return requireCsrf(req);
}
