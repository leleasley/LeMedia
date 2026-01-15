import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        const user = await getUser().catch(() => null);
        if (!user?.isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const csrf = requireCsrf(req);
        if (csrf) return csrf;

        const body = await req.json();
        const { config } = body;

        if (!config || !config.webhookUrl) {
            return NextResponse.json(
                { error: "Webhook URL is required" },
                { status: 400 }
            );
        }

        const payload: any = {
            content: undefined,
            username: config.botUsername || "LeMedia",
            avatar_url: config.botAvatarUrl || undefined,
            embeds: [
                {
                    title: "Test Notification",
                    description: "This is a test notification from LeMedia. If you received this, your Discord webhook is working correctly!",
                    color: 5814783, // Indigo color
                    timestamp: new Date().toISOString(),
                },
            ],
            allowed_mentions: {
                parse: [],
                users: [],
            },
        };

        // Add user mention if enabled
        if (config.enableMentions && config.discordUserId) {
            payload.content = `<@${config.discordUserId}>`;
            payload.allowed_mentions.users = [config.discordUserId];
        }

        const response = await fetch(config.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Discord API error: ${error}`);
        }

        return NextResponse.json({ success: true, message: "Test notification sent to Discord" });
    } catch (error: any) {
        logger.error("Failed to send Discord test:", error);
        return NextResponse.json({
            error: "Failed to send test notification",
            details: error?.message
        }, { status: 500 });
    }
}
