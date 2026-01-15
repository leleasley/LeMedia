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

        const url = new URL("/message", config.url);

        const response = await fetch(url.toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gotify-Key": config.token,
            },
            body: JSON.stringify({
                title: "LeMedia Test Notification",
                message: "This is a test notification from LeMedia. If you received this, your Gotify integration is working correctly!",
                priority: config.priority || 5,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gotify error (${response.status}): ${error}`);
        }

        return NextResponse.json({ success: true, message: "Test notification sent to Gotify" });
    } catch (error: any) {
        logger.error("Failed to send Gotify test:", error);
        return NextResponse.json({
            error: "Failed to send test notification",
            details: error?.message
        }, { status: 500 });
    }
}
