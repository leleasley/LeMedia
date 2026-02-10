import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const NtfySettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
    url: z.string().url(),
    topic: z.string().min(1),
    priority: z.number().int().min(1).max(5).optional(),
    authMethod: z.enum(["none", "basic", "token"]),
    username: z.string().optional(),
    password: z.string().optional(),
    token: z.string().optional(),
});

type NtfySettings = z.infer<typeof NtfySettingsSchema>;

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("ntfy");
        const settings: NtfySettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
            url: endpoint?.config.url || "https://ntfy.sh",
            topic: endpoint?.config.topic || "",
            priority: endpoint?.config.priority || 3,
            authMethod: endpoint?.config.authMethod || "none",
            username: endpoint?.config.username || "",
            password: endpoint?.config.password || "",
            token: endpoint?.config.token || "",
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load Ntfy settings:", error);
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
        const validated = NtfySettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        await updateNotificationEndpoint("ntfy", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save Ntfy settings:", error);
        if (error instanceof z.ZodError) {
            logger.warn("Invalid Ntfy settings payload", { issues: error.issues });
            return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
