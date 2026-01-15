import { NextRequest, NextResponse } from "next/server";
import {
    getNotificationEndpointById,
    updateNotificationEndpointById,
    deleteNotificationEndpoint,
} from "@/lib/notifications";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { notificationTypeSchema } from "@/lib/notification-types";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    try {
        const user = await requireAdmin();
        if (user instanceof NextResponse) return user;

        const { type, id } = await params;
        const parsedType = notificationTypeSchema.safeParse(type);
        if (!parsedType.success) {
            return jsonResponseWithETag(request, { error: "Unsupported notification type" }, { status: 400 });
        }

        const endpointId = parseInt(id, 10);
        if (isNaN(endpointId)) {
            return jsonResponseWithETag(request, { error: "Invalid endpoint ID" }, { status: 400 });
        }

        const endpoint = await getNotificationEndpointById(endpointId);

        if (!endpoint) {
            return jsonResponseWithETag(request, 
                { error: "Notification endpoint not found" },
                { status: 404 }
            );
        }

        return jsonResponseWithETag(request, endpoint);
    } catch (error) {
        logger.error("Error fetching notification endpoint", error);
        return jsonResponseWithETag(request, 
            { error: "Failed to fetch notification endpoint" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    try {
        const user = await requireAdmin();
        if (user instanceof NextResponse) return user;
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const { type, id } = await params;
        const parsedType = notificationTypeSchema.safeParse(type);
        if (!parsedType.success) {
            return NextResponse.json({ error: "Unsupported notification type" }, { status: 400 });
        }

        const endpointId = parseInt(id, 10);
        if (isNaN(endpointId)) {
            return NextResponse.json({ error: "Invalid endpoint ID" }, { status: 400 });
        }

        const body = await request.json();
        const { name, enabled, types, config } = body;

        if (!name) {
            return NextResponse.json(
                { error: "Name is required" },
                { status: 400 }
            );
        }

        const endpoint = await updateNotificationEndpointById(
            endpointId,
            name,
            enabled ?? true,
            types ?? 0,
            config ?? {}
        );

        await logAuditEvent({
            action: "notification_endpoint.updated",
            actor: user.username,
            target: id,
            metadata: { type: parsedType.data, name },
            ip: getClientIp(request),
        });

        return NextResponse.json(endpoint);
    } catch (error) {
        logger.error("Error updating notification endpoint", error);
        return NextResponse.json(
            { error: "Failed to update notification endpoint" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    try {
        const user = await requireAdmin();
        if (user instanceof NextResponse) return user;
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const { type, id } = await params;
        const parsedType = notificationTypeSchema.safeParse(type);
        if (!parsedType.success) {
            return NextResponse.json({ error: "Unsupported notification type" }, { status: 400 });
        }

        const endpointId = parseInt(id, 10);
        if (isNaN(endpointId)) {
            return NextResponse.json({ error: "Invalid endpoint ID" }, { status: 400 });
        }

        await deleteNotificationEndpoint(endpointId);

        await logAuditEvent({
            action: "notification_endpoint.deleted",
            actor: user.username,
            target: id,
            metadata: { type: parsedType.data },
            ip: getClientIp(request),
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error deleting notification endpoint", error);
        return NextResponse.json(
            { error: "Failed to delete notification endpoint" },
            { status: 500 }
        );
    }
}
