import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const SlackSettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
    webhookUrl: z.string().url(),
    botUsername: z.string().optional(),
    botEmoji: z.string().optional(),
});

type SlackSettings = z.infer<typeof SlackSettingsSchema>;

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("slack");
        const settings: SlackSettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
            webhookUrl: endpoint?.config.webhookUrl || "",
            botUsername: endpoint?.config.botUsername || "LeMedia",
            botEmoji: endpoint?.config.botEmoji || ":bell:",
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load Slack settings:", error);
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
        const validated = SlackSettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        await updateNotificationEndpoint("slack", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save Slack settings:", error);
        if (error instanceof z.ZodError) {
            logger.warn("Invalid Slack settings payload", { issues: error.issues });
            return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
