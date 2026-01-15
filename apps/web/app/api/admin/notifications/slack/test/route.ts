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

        const payload = {
            username: config.botUsername || "LeMedia",
            icon_emoji: config.botEmoji || ":bell:",
            text: "Test Notification from LeMedia",
            attachments: [
                {
                    color: "#5865F2",
                    title: "LeMedia Test Notification",
                    text: "This is a test notification from LeMedia. If you received this, your Slack webhook is working correctly!",
                    footer: "LeMedia",
                    ts: Math.floor(Date.now() / 1000),
                },
            ],
        };

        const response = await fetch(config.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Slack error (${response.status}): ${error}`);
        }

        return NextResponse.json({ success: true, message: "Test notification sent to Slack" });
    } catch (error: any) {
        logger.error("Failed to send Slack test:", error);
        return NextResponse.json({
            error: "Failed to send test notification",
            details: error?.message
        }, { status: 500 });
    }
}
