import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const TelegramSettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
    botToken: z.string().min(1),
    chatId: z.string().min(1),
    messageThreadId: z.string().optional(),
    sendSilently: z.boolean().optional(),
});

type TelegramSettings = z.infer<typeof TelegramSettingsSchema>;

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("telegram");
        const settings: TelegramSettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
            botToken: endpoint?.config.botToken || "",
            chatId: endpoint?.config.chatId || "",
            messageThreadId: endpoint?.config.messageThreadId || "",
            sendSilently: endpoint?.config.sendSilently || false,
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load Telegram settings:", error);
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
        const validated = TelegramSettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        await updateNotificationEndpoint("telegram", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save Telegram settings:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid settings", details: error.issues }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
