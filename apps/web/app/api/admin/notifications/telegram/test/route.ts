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

        const telegramApiUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

        const payload: any = {
            chat_id: config.chatId,
            text: "🔔 *LeMedia Test Notification*\n\nThis is a test notification from LeMedia. If you received this, your Telegram bot is working correctly!",
            parse_mode: "Markdown",
            disable_notification: config.sendSilently || false,
        };

        if (config.messageThreadId) {
            payload.message_thread_id = parseInt(config.messageThreadId);
        }

        const response = await fetch(telegramApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(`Telegram API error: ${data.description || "Unknown error"}`);
        }

        return NextResponse.json({ success: true, message: "Test notification sent to Telegram" });
    } catch (error: any) {
        logger.error("Failed to send Telegram test:", error);
        return NextResponse.json({
            error: "Failed to send test notification",
            details: error?.message
        }, { status: 500 });
    }
}
