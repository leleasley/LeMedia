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
    let username = "";
    try {
        apiKey = decryptSecret(service.api_key_encrypted);
    } catch {
        return jsonResponseWithETag(_req, { ok: false, error: "Unable to decrypt API key" }, { status: 400 });
    }
    if (service.config && typeof service.config === "object") {
        username = (service.config as Record<string, any>)?.username ?? "";
    }

    try {
        if (service.type === "radarr" || service.type === "sonarr") {
            const url = `${baseUrl}/api/v3/system/status`;
            const res = await fetch(url, { headers: { "X-Api-Key": apiKey }, signal: AbortSignal.timeout(5000) });
            if (!res.ok) {
                return jsonResponseWithETag(_req, { ok: false, error: `Status ${res.status}` }, { status: 400 });
            }
            const payload = await res.json().catch(() => ({}));
            return jsonResponseWithETag(_req, { ok: true, data: payload });
        }
        if (service.type === "prowlarr") {
            const url = `${baseUrl}/api/v1/system/status`;
            const res = await fetch(url, { headers: { "X-Api-Key": apiKey }, signal: AbortSignal.timeout(5000) });
            if (!res.ok) {
                return jsonResponseWithETag(_req, { ok: false, error: `Status ${res.status}` }, { status: 400 });
            }
            const payload = await res.json().catch(() => ({}));
            return jsonResponseWithETag(_req, { ok: true, data: payload });
        }
        if (service.type === "sabnzbd") {
            const url = new URL(`${baseUrl}/api`);
            url.searchParams.set("mode", "version");
            url.searchParams.set("output", "json");
            url.searchParams.set("apikey", apiKey);
            const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
            if (!res.ok) {
                return jsonResponseWithETag(_req, { ok: false, error: `Status ${res.status}` }, { status: 400 });
            }
            const payload = await res.json().catch(() => ({}));
            return jsonResponseWithETag(_req, { ok: true, data: payload });
        }
        if (service.type === "nzbget") {
            if (!username) {
                return jsonResponseWithETag(_req, { ok: false, error: "Username required" }, { status: 400 });
            }
            const url = `${baseUrl}/jsonrpc`;
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
            if (!res.ok) {
                return jsonResponseWithETag(_req, { ok: false, error: `Status ${res.status}` }, { status: 400 });
            }
            const payload = await res.json().catch(() => ({}));
            return jsonResponseWithETag(_req, { ok: true, data: payload });
        }
        if (service.type === "qbittorrent") {
            if (!username) {
                return jsonResponseWithETag(_req, { ok: false, error: "Username required" }, { status: 400 });
            }
            const loginUrl = `${baseUrl}/api/v2/auth/login`;
            const loginBody = new URLSearchParams({ username, password: apiKey });
            const loginRes = await fetch(loginUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: loginBody.toString(),
                signal: AbortSignal.timeout(5000)
            });
            const loginText = await loginRes.text().catch(() => "");
            if (!loginRes.ok || !loginText.toLowerCase().includes("ok")) {
                return jsonResponseWithETag(_req, { ok: false, error: "Login failed" }, { status: 400 });
            }
            const cookies = loginRes.headers.get("set-cookie") ?? "";
            const versionRes = await fetch(`${baseUrl}/api/v2/app/version`, {
                headers: { Cookie: cookies },
                signal: AbortSignal.timeout(5000)
            });
            if (!versionRes.ok) {
                return jsonResponseWithETag(_req, { ok: false, error: `Status ${versionRes.status}` }, { status: 400 });
            }
            const payload = await versionRes.text().catch(() => "");
            return jsonResponseWithETag(_req, { ok: true, data: { version: payload } });
        }
        return jsonResponseWithETag(_req, { ok: false, error: "Unsupported service type" }, { status: 400 });
    } catch (err: any) {
        return jsonResponseWithETag(_req, { ok: false, error: err?.message ?? "Unable to reach service" }, { status: 400 });
    }
}
