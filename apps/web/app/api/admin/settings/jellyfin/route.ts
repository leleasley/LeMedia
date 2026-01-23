import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJellyfinConfig, setJellyfinConfig } from "@/db";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { fetchJellyfinServerInfo } from "@/lib/jellyfin-admin";
import { invalidateJellyfinCaches } from "@/lib/jellyfin";

const payloadSchema = z.object({
    hostname: z.string().trim(),
    port: z.number().int().min(1).max(65535),
    useSsl: z.boolean(),
    urlBase: z.string(),
    externalUrl: z.string().optional(),
    jellyfinForgotPasswordUrl: z.string().optional(),
    apiKey: z.string().optional(),
    serverId: z.string().optional()
});

async function ensureAdmin() {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    return null;
}

function buildBaseUrl(payload: z.infer<typeof payloadSchema>) {
    const host = payload.hostname.trim();
    const port = payload.port ? `:${payload.port}` : "";
    const base = payload.urlBase.trim();
    const path = base ? (base.startsWith("/") ? base : `/${base}`) : "";
    return `${payload.useSsl ? "https" : "http"}://${host}${port}${path}`;
}

export async function GET(req: NextRequest) {
    const forbidden = await ensureAdmin();
    if (forbidden) return forbidden;
    const config = await getJellyfinConfig();
    return jsonResponseWithETag(req, {
        name: config.name,
        hostname: config.hostname,
        port: config.port,
        useSsl: config.useSsl,
        urlBase: config.urlBase,
        externalUrl: config.externalUrl,
        jellyfinForgotPasswordUrl: config.jellyfinForgotPasswordUrl,
        libraries: config.libraries,
        serverId: config.serverId,
        hasApiKey: Boolean(config.apiKeyEncrypted)
    });
}

export async function PUT(req: NextRequest) {
    const forbidden = await ensureAdmin();
    if (forbidden) return forbidden;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
    }

    const current = await getJellyfinConfig();
    const apiKeyEncrypted =
        parsed.data.apiKey && parsed.data.apiKey.trim().length > 0
            ? encryptSecret(parsed.data.apiKey.trim())
            : current.apiKeyEncrypted;
    const baseUrl = buildBaseUrl(parsed.data).replace(/\/+$/, "");
    const apiKeyForLookup =
        parsed.data.apiKey?.trim() ||
        (current.apiKeyEncrypted ? (() => {
            try {
                return decryptSecret(current.apiKeyEncrypted);
            } catch {
                return "";
            }
        })() : "");
    const detectedInfo = apiKeyForLookup
        ? await fetchJellyfinServerInfo(baseUrl, apiKeyForLookup)
        : { id: null, name: null };
    const serverId = (detectedInfo.id ?? parsed.data.serverId ?? current.serverId ?? "").trim();
    const name = (detectedInfo.name ?? current.name ?? "").trim();

    await setJellyfinConfig({
        name,
        hostname: parsed.data.hostname,
        port: parsed.data.port,
        useSsl: parsed.data.useSsl,
        urlBase: parsed.data.urlBase,
        externalUrl: parsed.data.externalUrl ?? "",
        jellyfinForgotPasswordUrl: parsed.data.jellyfinForgotPasswordUrl ?? current.jellyfinForgotPasswordUrl ?? "",
        libraries: current.libraries ?? [],
        serverId,
        apiKeyEncrypted
    });
    invalidateJellyfinCaches("admin settings updated");

    // Log settings change
    const user = await requireAdmin();
    if (!(user instanceof NextResponse)) {
        await logAuditEvent({
            action: "admin.settings_changed",
            actor: user.username,
            metadata: { section: "jellyfin" },
            ip: getClientIp(req),
        });
    }

    return NextResponse.json({ ok: true });
}
