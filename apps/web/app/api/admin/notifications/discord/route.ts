import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const DiscordSettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
    webhookUrl: z.string().url(),
    botUsername: z.string().optional(),
    botAvatarUrl: z.string().url().optional().or(z.literal("")),
    enableMentions: z.boolean().optional(),
    roleId: z.string().optional(),
});

type DiscordSettings = z.infer<typeof DiscordSettingsSchema>;

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("discord");
        const settings: DiscordSettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
            webhookUrl: endpoint?.config.webhookUrl || "",
            botUsername: endpoint?.config.botUsername || "LeMedia",
            botAvatarUrl: endpoint?.config.botAvatarUrl || "",
            enableMentions: endpoint?.config.enableMentions || false,
            roleId: endpoint?.config.roleId || "",
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load Discord settings:", error);
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
        const validated = DiscordSettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        await updateNotificationEndpoint("discord", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save Discord settings:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid settings", details: error.issues }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
