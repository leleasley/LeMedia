import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getPlexConfig } from "@/db";
import { getPlexBaseUrl, getPlexToken, fetchPlexServerInfo } from "@/lib/plex-admin";
import { requireCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  return null;
}

export async function POST(req: NextRequest) {
  const forbidden = await ensureAdmin();
  if (forbidden) return forbidden;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const config = await getPlexConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "PLEX_DISABLED" }, { status: 409 });
  }

  const baseUrl = await getPlexBaseUrl();
  const token = await getPlexToken();
  if (!baseUrl || !token) {
    return NextResponse.json({ error: "PLEX_NOT_CONFIGURED" }, { status: 400 });
  }

  const info = await fetchPlexServerInfo(baseUrl, token);
  if (!info.id && !info.name) {
    return NextResponse.json({ error: "PLEX_TEST_FAILED" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, serverId: info.id, name: info.name });
}
