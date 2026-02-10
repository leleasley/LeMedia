import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const GotifySettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
    url: z.string().url(),
    token: z.string().min(1),
    priority: z.number().int().min(0).max(10).optional(),
});

type GotifySettings = z.infer<typeof GotifySettingsSchema>;

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("gotify");
        const settings: GotifySettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
            url: endpoint?.config.url || "",
            token: endpoint?.config.token || "",
            priority: endpoint?.config.priority || 5,
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load Gotify settings:", error);
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
        const validated = GotifySettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        await updateNotificationEndpoint("gotify", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save Gotify settings:", error);
        if (error instanceof z.ZodError) {
            logger.warn("Invalid Gotify settings payload", { issues: error.issues });
            return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
