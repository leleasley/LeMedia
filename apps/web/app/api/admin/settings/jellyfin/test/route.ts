import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const payloadSchema = z.object({
    hostname: z.string().trim(),
    port: z.number().int().min(1).max(65535),
    useSsl: z.boolean(),
    urlBase: z.string(),
    apiKey: z.string().min(1)
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

export async function POST(req: NextRequest) {
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
        logger.warn("[API] Invalid Jellyfin test payload", { issues: parsed.error.issues });
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const baseUrl = buildBaseUrl(parsed.data).replace(/\/+$/, "");
    try {
        const res = await fetch(`${baseUrl}/System/Info`, {
            headers: { "X-Emby-Token": parsed.data.apiKey.trim() }
        });
        if (!res.ok) {
            return NextResponse.json({ ok: false, error: `Status ${res.status}` }, { status: 400 });
        }
        const payload = await res.json().catch(() => ({}));
        return NextResponse.json({ ok: true, data: payload });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "Unable to reach Jellyfin" }, { status: 400 });
    }
}
