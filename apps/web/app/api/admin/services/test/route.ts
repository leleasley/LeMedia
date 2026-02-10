import { requireAdmin } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { getMediaServiceSecretById } from "@/lib/service-config";
import { decryptSecret } from "@/lib/encryption";

const bodySchema = z.object({
  id: z.number().optional(),
  type: z.enum(["radarr", "sonarr", "prowlarr", "sabnzbd", "qbittorrent", "nzbget"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
  username: z.string().optional()
});

async function fetchServiceStatus(
  type: "radarr" | "sonarr" | "prowlarr" | "sabnzbd" | "qbittorrent" | "nzbget",
  baseUrl: string,
  apiKey: string,
  username?: string
) {
  const root = baseUrl.replace(/\/+$/, "");
  try {
    if (type === "radarr" || type === "sonarr") {
      const url = `${root}/api/v3/system/status`;
      const res = await fetch(url, { headers: { "X-Api-Key": apiKey }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const payload = await res.json().catch(() => ({}));
      return { ok: true, data: payload };
    }
    if (type === "prowlarr") {
      const url = `${root}/api/v1/system/status`;
      const res = await fetch(url, { headers: { "X-Api-Key": apiKey }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const payload = await res.json().catch(() => ({}));
      return { ok: true, data: payload };
    }
    if (type === "sabnzbd") {
      const url = new URL(`${root}/api`);
      url.searchParams.set("mode", "version");
      url.searchParams.set("output", "json");
      url.searchParams.set("apikey", apiKey);
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const payload = await res.json().catch(() => ({}));
      return { ok: true, data: payload };
    }
    if (type === "nzbget") {
      if (!username) {
        return { ok: false, error: "Username is required" };
      }
      const url = `${root}/jsonrpc`;
      const auth = Buffer.from(`${username}:${apiKey}`).toString("base64");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`
        },
        body: JSON.stringify({ method: "version", params: [], id: 1 }),
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const payload = await res.json().catch(() => ({}));
      return { ok: true, data: payload };
    }
    if (type === "qbittorrent") {
      if (!username) {
        return { ok: false, error: "Username is required" };
      }
      const loginUrl = `${root}/api/v2/auth/login`;
      const loginBody = new URLSearchParams({ username, password: apiKey });
      const loginRes = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: loginBody.toString(),
        signal: AbortSignal.timeout(5000)
      });
      const loginText = await loginRes.text().catch(() => "");
      if (!loginRes.ok || !loginText.toLowerCase().includes("ok")) {
        throw new Error("Login failed");
      }
      const cookies = loginRes.headers.get("set-cookie") ?? "";
      const versionRes = await fetch(`${root}/api/v2/app/version`, {
        headers: { Cookie: cookies },
        signal: AbortSignal.timeout(5000)
      });
      if (!versionRes.ok) throw new Error(`Status ${versionRes.status}`);
      const payload = await versionRes.text().catch(() => "");
      return { ok: true, data: { version: payload } };
    }
    return { ok: false, error: "Unsupported service type" };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to reach service" };
  }
}

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

  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    console.warn("[API] Invalid service test payload", { issues: parsed.error.issues });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let apiKey = parsed.data.apiKey;
  let username = parsed.data.username;
  if ((!apiKey || !username) && parsed.data.id) {
      const service = await getMediaServiceSecretById(parsed.data.id);
      if (service?.api_key_encrypted && !apiKey) {
          try {
              apiKey = decryptSecret(service.api_key_encrypted);
          } catch {
              // Failed to decrypt
          }
      }
      if (service?.config && !username) {
          username = (service.config as Record<string, any>)?.username;
      }
  }

  if (!apiKey) {
      return NextResponse.json({ error: "Secret is required" }, { status: 400 });
  }

  const result = await fetchServiceStatus(parsed.data.type, parsed.data.baseUrl, apiKey, username);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: result.data });
}
