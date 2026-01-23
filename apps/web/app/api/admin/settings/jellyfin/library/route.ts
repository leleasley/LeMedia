import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJellyfinConfig, setJellyfinConfig } from "@/db";
import { getJellyfinBaseUrl, getJellyfinApiKey, listJellyfinLibraries } from "@/lib/jellyfin-admin";
import { invalidateJellyfinCaches } from "@/lib/jellyfin";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  return null;
}

export async function GET(req: NextRequest) {
  const forbidden = await ensureAdmin();
  if (forbidden) return forbidden;

  const config = await getJellyfinConfig();
  const sync = req.nextUrl.searchParams.get("sync") === "true" || req.nextUrl.searchParams.get("sync") === "1";
  const enableParam = req.nextUrl.searchParams.get("enable");
  const enabledIds = enableParam ? enableParam.split(",").map((id) => id.trim()).filter(Boolean) : null;

  let libraries = config.libraries ?? [];

  if (sync) {
    const baseUrl = await getJellyfinBaseUrl();
    const apiKey = await getJellyfinApiKey();
    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: "JELLYFIN_NOT_CONFIGURED" }, { status: 400 });
    }

    const fetched = await listJellyfinLibraries(baseUrl, apiKey);
    if (!fetched.length) {
      return NextResponse.json({ error: "SYNC_ERROR_NO_LIBRARIES" }, { status: 400 });
    }

    const previousEnabled = new Map(libraries.map((lib) => [lib.id, lib.enabled]));
    libraries = fetched.map((lib) => ({
      ...lib,
      enabled: enabledIds ? enabledIds.includes(lib.id) : (previousEnabled.get(lib.id) ?? true)
    }));
  } else if (enabledIds) {
    libraries = libraries.map((lib) => ({
      ...lib,
      enabled: enabledIds.includes(lib.id)
    }));
  }

  if (sync || enabledIds) {
    await setJellyfinConfig({ ...config, libraries });
    invalidateJellyfinCaches("jellyfin libraries updated");
  }

  return NextResponse.json({ ok: true, libraries });
}
