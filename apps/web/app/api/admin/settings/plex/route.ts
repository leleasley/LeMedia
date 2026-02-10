import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getPlexConfig, setPlexConfig } from "@/db";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { fetchPlexServerInfo } from "@/lib/plex-admin";

const payloadSchema = z.object({
    enabled: z.boolean(),
    hostname: z.string().trim(),
    port: z.number().int().min(1).max(65535),
    useSsl: z.boolean(),
    urlBase: z.string(),
    externalUrl: z.string().optional(),
    token: z.string().optional(),
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
    const config = await getPlexConfig();
    return jsonResponseWithETag(req, {
        enabled: config.enabled,
        name: config.name,
        hostname: config.hostname,
        port: config.port,
        useSsl: config.useSsl,
        urlBase: config.urlBase,
        externalUrl: config.externalUrl,
        libraries: config.libraries,
        serverId: config.serverId,
        hasToken: Boolean(config.tokenEncrypted)
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
        console.warn("[API] Invalid Plex settings payload", { issues: parsed.error.issues });
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const current = await getPlexConfig();
    const tokenEncrypted =
        parsed.data.token && parsed.data.token.trim().length > 0
            ? encryptSecret(parsed.data.token.trim())
            : current.tokenEncrypted;

    const baseUrl = buildBaseUrl(parsed.data).replace(/\/+$/, "");
    const tokenForLookup =
        parsed.data.token?.trim() ||
        (current.tokenEncrypted ? (() => {
            try {
                return decryptSecret(current.tokenEncrypted);
            } catch {
                return "";
            }
        })() : "");

    const detectedInfo = tokenForLookup && parsed.data.hostname.trim()
        ? await fetchPlexServerInfo(baseUrl, tokenForLookup)
        : { id: null, name: null };

    const serverId = (detectedInfo.id ?? parsed.data.serverId ?? current.serverId ?? "").trim();
    const name = (detectedInfo.name ?? current.name ?? "").trim();

    await setPlexConfig({
        enabled: parsed.data.enabled,
        name,
        hostname: parsed.data.hostname,
        port: parsed.data.port,
        useSsl: parsed.data.useSsl,
        urlBase: parsed.data.urlBase,
        externalUrl: parsed.data.externalUrl ?? "",
        libraries: current.libraries ?? [],
        serverId,
        tokenEncrypted
    });

    const user = await requireAdmin();
    if (!(user instanceof NextResponse)) {
        await logAuditEvent({
            action: "admin.settings_changed",
            actor: user.username,
            metadata: { section: "plex" },
            ip: getClientIp(req),
        });
    }

    return NextResponse.json({ ok: true });
}
