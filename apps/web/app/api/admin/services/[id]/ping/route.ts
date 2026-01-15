import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getMediaServiceSecretById } from "@/lib/service-config";
import { decryptSecret } from "@/lib/encryption";
import { jsonResponseWithETag } from "@/lib/api-optimization";

type MediaServiceRouteContext = { params: Promise<{ id: string }> };

async function ensureAdmin() {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    return null;
}

export async function GET(_req: NextRequest, context: MediaServiceRouteContext) {
    const forbidden = await ensureAdmin();
    if (forbidden) return forbidden;

    const resolvedParams = await context.params;
    const id = Number(resolvedParams.id);
    if (!Number.isFinite(id)) {
        return jsonResponseWithETag(_req, { error: "Invalid id" }, { status: 400 });
    }

    const service = await getMediaServiceSecretById(id);
    if (!service) {
        return jsonResponseWithETag(_req, { error: "Service not found" }, { status: 404 });
    }

    const baseUrl = service.base_url.replace(/\/+$/, "");
    let apiKey = "";
    try {
        apiKey = decryptSecret(service.api_key_encrypted);
    } catch {
        return jsonResponseWithETag(_req, { ok: false, error: "Unable to decrypt API key" }, { status: 400 });
    }

    try {
        const url = `${baseUrl}/api/v3/system/status`;
        const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
        if (!res.ok) {
            return jsonResponseWithETag(_req, { ok: false, error: `Status ${res.status}` }, { status: 400 });
        }
        const payload = await res.json().catch(() => ({}));
        return jsonResponseWithETag(_req, { ok: true, data: payload });
    } catch (err: any) {
        return jsonResponseWithETag(_req, { ok: false, error: err?.message ?? "Unable to reach service" }, { status: 400 });
    }
}
