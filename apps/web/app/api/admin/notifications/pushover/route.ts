import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const PushoverSettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
    userKey: z.string().min(1),
    apiToken: z.string().min(1),
    priority: z.number().int().min(-2).max(2).optional(),
    sound: z.string().optional(),
});

type PushoverSettings = z.infer<typeof PushoverSettingsSchema>;

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("pushover");
        const settings: PushoverSettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
            userKey: endpoint?.config.userKey || "",
            apiToken: endpoint?.config.apiToken || "",
            priority: endpoint?.config.priority || 0,
            sound: endpoint?.config.sound || "pushover",
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load Pushover settings:", error);
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
        const validated = PushoverSettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        await updateNotificationEndpoint("pushover", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save Pushover settings:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid settings", details: error.issues }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
