import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const WebhookSettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
    webhookUrl: z.string().url(),
    authHeader: z.string().optional(),
    jsonPayload: z.string(),
});

type WebhookSettings = z.infer<typeof WebhookSettingsSchema>;

const defaultPayload = JSON.stringify({
    notification_type: "{{notification_type}}",
    event: "{{event}}",
    subject: "{{subject}}",
    message: "{{message}}",
    image: "{{image}}",
    timestamp: "{{timestamp}}",
    media: {
        media_type: "{{media_type}}",
        tmdb_id: "{{media_tmdbid}}",
        tvdb_id: "{{media_tvdbid}}",
        status: "{{media_status}}",
        status4k: "{{media_status4k}}",
    },
    request: {
        request_id: "{{request_id}}",
        requestedBy_email: "{{requestedBy_email}}",
        requestedBy_username: "{{requestedBy_username}}",
        requestedBy_avatar: "{{requestedBy_avatar}}",
    },
}, null, 2);

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("webhook");
        const settings: WebhookSettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
            webhookUrl: endpoint?.config.webhookUrl || "",
            authHeader: endpoint?.config.authHeader || "",
            jsonPayload: endpoint?.config.jsonPayload || defaultPayload,
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load webhook settings:", error);
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
        const validated = WebhookSettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        await updateNotificationEndpoint("webhook", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save webhook settings:", error);
        if (error instanceof z.ZodError) {
            logger.warn("Invalid webhook settings payload", { issues: error.issues });
            return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
