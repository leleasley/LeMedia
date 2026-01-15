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

        const payload: any = {
            type: "note",
            title: "LeMedia Test Notification",
            body: "This is a test notification from LeMedia. If you received this, your Pushbullet integration is working correctly!",
        };

        if (config.channelTag) {
            payload.channel_tag = config.channelTag;
        }

        const response = await fetch("https://api.pushbullet.com/v2/pushes", {
            method: "POST",
            headers: {
                "Access-Token": config.accessToken,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Pushbullet error: ${error.error?.message || "Unknown error"}`);
        }

        return NextResponse.json({ success: true, message: "Test notification sent to Pushbullet" });
    } catch (error: any) {
        logger.error("Failed to send Pushbullet test:", error);
        return NextResponse.json({
            error: "Failed to send test notification",
            details: error?.message
        }, { status: 500 });
    }
}
