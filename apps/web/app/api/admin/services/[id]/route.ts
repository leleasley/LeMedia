import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { deleteMediaService, updateMediaService } from "@/lib/service-config";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

const updateSchema = z.object({
    name: z.string().min(1).optional(),
    type: z.enum(["radarr", "sonarr", "prowlarr", "sabnzbd", "qbittorrent", "nzbget"]).optional(),
    baseUrl: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
    config: z.record(z.string(), z.any()).optional(),
    enabled: z.boolean().optional()
});

type MediaServiceRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: MediaServiceRouteContext) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const resolvedParams = await context.params;
    const id = Number(resolvedParams.id);
    if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const input = updateSchema.parse(body);
        const service = await updateMediaService(id, input);
        if (!service) {
            return NextResponse.json({ error: "Service not found" }, { status: 404 });
        }

        await logAuditEvent({
            action: "admin.settings_changed",
            actor: user.username,
            metadata: { field: "media_service_update", serviceId: id },
            ip: getClientIp(req),
        });

        return NextResponse.json({ service });
    } catch (err: any) {
        if (err?.issues) {
            console.warn("[API] Invalid media service update", { issues: err.issues });
            return NextResponse.json({ error: "Invalid input" }, { status: 400 });
        }
        return NextResponse.json({ error: err?.message ?? "Failed to update" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, context: MediaServiceRouteContext) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const resolvedParams = await context.params;
    const id = Number(resolvedParams.id);
    if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await deleteMediaService(id);

    await logAuditEvent({
        action: "admin.settings_changed",
        actor: user.username,
        metadata: { field: "media_service_delete", serviceId: id },
        ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
}
