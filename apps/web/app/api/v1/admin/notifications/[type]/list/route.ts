import { NextRequest, NextResponse } from "next/server";
import { listNotificationEndpointsByType } from "@/lib/notifications";
import { requireAdmin } from "@/auth";
import { notificationTypeSchema } from "@/lib/notification-types";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string }> }
) {
    try {
        const user = await requireAdmin();
        if (user instanceof NextResponse) return user;

        const { type } = await params;
        logger.info(`[V1 Notifications List] Requested type: ${type}`);
        const parsedType = notificationTypeSchema.safeParse(type);
        if (!parsedType.success) {
            logger.error(`[V1 Notifications List] Invalid type: ${type}, errors:`, parsedType.error);
            return jsonResponseWithETag(request, { error: "Unsupported notification type" }, { status: 400 });
        }

        const endpoints = await listNotificationEndpointsByType(parsedType.data);
        return jsonResponseWithETag(request, endpoints);
    } catch (error) {
        logger.error("[V1 Notifications List] Error fetching notification endpoints:", error);
        return jsonResponseWithETag(request, 
            { error: "Failed to fetch notification endpoints" },
            { status: 500 }
        );
    }
}
