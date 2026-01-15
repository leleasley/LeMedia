import { NextRequest, NextResponse } from "next/server";
import { listNotificationEndpointsByType } from "@/lib/notifications";
import { requireAdmin } from "@/auth";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
    try {
        const user = await requireAdmin();
        if (user instanceof NextResponse) return user;

        // /api/v1/admin/notifications/{type}/list -> index 5 is the type
        const type = request.nextUrl.pathname.split("/")[5];
        const endpoints = await listNotificationEndpointsByType(type as any);
        return jsonResponseWithETag(request, endpoints);
    } catch (error) {
        logger.error("Error fetching notification endpoints:", error);
        return jsonResponseWithETag(request, 
            { error: "Failed to fetch notification endpoints" },
            { status: 500 }
        );
    }
}
