import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { z } from "zod";
import { getNotificationEndpointByType, updateNotificationEndpoint } from "@/lib/notifications";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const EmailSettingsSchema = z.object({
    enabled: z.boolean(),
    types: z.number().int(),
    senderName: z.string(),
    senderAddress: z.string().email(),
    smtpHost: z.string().min(1),
    smtpPort: z.number().int().min(1).max(65535),
    encryption: z.enum(["none", "starttls", "tls"]),
    authUser: z.string(),
    authPass: z.string(),
    allowSelfSigned: z.boolean().optional(),
    pgpPrivateKey: z.string().optional(),
    pgpPassword: z.string().optional(),
});

type EmailSettings = z.infer<typeof EmailSettingsSchema>;

export async function GET(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
        }

        const endpoint = await getNotificationEndpointByType("email");
        const settings: EmailSettings = {
            enabled: endpoint?.enabled || false,
            types: endpoint?.types || 127,
            senderName: endpoint?.config.senderName || "LeMedia",
            senderAddress: endpoint?.config.senderAddress || "",
            smtpHost: endpoint?.config.smtpHost || "",
            smtpPort: endpoint?.config.smtpPort || 587,
            encryption: endpoint?.config.encryption || "starttls",
            authUser: endpoint?.config.authUser || "",
            authPass: "",
            allowSelfSigned: endpoint?.config.allowSelfSigned || false,
            pgpPrivateKey: endpoint?.config.pgpPrivateKey || "",
            pgpPassword: endpoint?.config.pgpPassword || "",
        };

        return jsonResponseWithETag(req, { settings });
    } catch (error) {
        logger.error("Failed to load email settings:", error);
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
        const validated = EmailSettingsSchema.parse(body);

        const { enabled, types, ...config } = validated;
        const existing = await getNotificationEndpointByType("email");
        const existingPass = existing?.config?.authPass || "";
        if (!config.authPass?.trim()) {
            config.authPass = existingPass;
        }
        await updateNotificationEndpoint("email", enabled, types, config);

        return NextResponse.json({ settings: validated, success: true });
    } catch (error) {
        logger.error("Failed to save email settings:", error);
        if (error instanceof z.ZodError) {
            logger.warn("Invalid email settings payload", { issues: error.issues });
            return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
