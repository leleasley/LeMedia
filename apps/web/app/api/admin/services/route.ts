import { requireAdmin } from "@/auth";
import { listMediaServices, createMediaService } from "@/lib/service-config";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const createSchema = z.object({
    name: z.string().min(1),
    type: z.enum(["radarr", "sonarr", "prowlarr", "sabnzbd", "qbittorrent", "nzbget"]),
    baseUrl: z.string().min(1),
    apiKey: z.string().min(1),
    config: z.record(z.string(), z.any()).optional(),
    enabled: z.boolean().optional()
});

export async function GET(req: NextRequest) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    const services = await listMediaServices();
    return jsonResponseWithETag(req, { services });
}

export async function POST(req: NextRequest) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const input = createSchema.parse(body);
        const service = await createMediaService({ ...input, config: input.config ?? {} });
        
        if (!(user instanceof NextResponse)) {
            await logAuditEvent({
                action: "admin.settings_changed",
                actor: user.username,
                metadata: { field: "media_service", service: service.name, type: service.type },
                ip: getClientIp(req),
            });
        }

        return NextResponse.json({ service }, { status: 201 });
    } catch (err: any) {
        if (err?.issues) {
            logger.warn("[API] Invalid media service payload", { issues: err.issues });
            return NextResponse.json({ error: "Invalid input" }, { status: 400 });
        }
        return NextResponse.json({ error: err?.message ?? "Failed to create service" }, { status: 500 });
    }
}
