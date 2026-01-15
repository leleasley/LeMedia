import { NextRequest, NextResponse } from "next/server";
import { createNotificationEndpoint } from "@/lib/notifications";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { notificationTypeSchema } from "@/lib/notification-types";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ type: string }> }
) {
    try {
        const user = await requireAdmin();
        if (user instanceof NextResponse) return user;
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const { type } = await params;
        const parsedType = notificationTypeSchema.safeParse(type);
        if (!parsedType.success) {
            return NextResponse.json({ error: "Unsupported notification type" }, { status: 400 });
        }

        const body = await request.json();
        const { name, enabled, types, config, isGlobal } = body;

        if (!name) {
            return NextResponse.json(
                { error: "Name is required" },
                { status: 400 }
            );
        }

        const endpoint = await createNotificationEndpoint(
            name,
            parsedType.data,
            enabled ?? true,
            types ?? 0,
            config ?? {},
            isGlobal ?? false
        );

        await logAuditEvent({
            action: "notification_endpoint.created",
            actor: user.username,
            target: String(endpoint.id),
            metadata: { type: parsedType.data, name },
            ip: getClientIp(request),
        });

        return NextResponse.json(endpoint);
    } catch (error) {
        logger.error("Error creating notification endpoint", error);
        return NextResponse.json(
            { error: "Failed to create notification endpoint" },
            { status: 500 }
        );
    }
}
