import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const WebPushSettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
});

type WebPushSettings = z.infer<typeof WebPushSettingsSchema>;

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("webpush");
        const settings: WebPushSettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load WebPush settings:", error);
        return jsonResponseWithETag(req, { error: "Failed to load settings" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const csrf = requireCsrf(req);
        if (csrf) return csrf;

        const body = await req.json();
        const validated = WebPushSettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        await updateNotificationEndpoint("webpush", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save WebPush settings:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid settings", details: error.issues }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
