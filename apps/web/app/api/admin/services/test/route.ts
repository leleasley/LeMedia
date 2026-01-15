import { requireAdmin } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { getMediaServiceSecretById } from "@/lib/service-config";
import { decryptSecret } from "@/lib/encryption";

const bodySchema = z.object({
  id: z.number().optional(),
  type: z.enum(["radarr", "sonarr"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().optional()
});

async function fetchServiceStatus(type: "radarr" | "sonarr", baseUrl: string, apiKey: string) {
  const root = baseUrl.replace(/\/+$/, "");
  try {
    const url = `${root}/api/v3/system/status`;
    const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const payload = await res.json().catch(() => ({}));
    return { ok: true, data: payload };
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
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  let apiKey = parsed.data.apiKey;
  if (!apiKey && parsed.data.id) {
      const service = await getMediaServiceSecretById(parsed.data.id);
      if (service && service.api_key_encrypted) {
          try {
              apiKey = decryptSecret(service.api_key_encrypted);
          } catch {
              // Failed to decrypt
          }
      }
  }

  if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }

  const result = await fetchServiceStatus(parsed.data.type, parsed.data.baseUrl, apiKey);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: result.data });
}