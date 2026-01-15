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

        const formData = new URLSearchParams();
        formData.append("token", config.apiToken);
        formData.append("user", config.userKey);
        formData.append("title", "LeMedia Test Notification");
        formData.append("message", "This is a test notification from LeMedia. If you received this, your Pushover integration is working correctly!");
        formData.append("priority", String(config.priority || 0));
        if (config.sound) {
            formData.append("sound", config.sound);
        }

        const response = await fetch("https://api.pushover.net/1/messages.json", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
        });

        const data = await response.json();

        if (!response.ok || data.status !== 1) {
            throw new Error(`Pushover error: ${data.errors?.join(", ") || "Unknown error"}`);
        }

        return NextResponse.json({ success: true, message: "Test notification sent to Pushover" });
    } catch (error: any) {
        logger.error("Failed to send Pushover test:", error);
        return NextResponse.json({
            error: "Failed to send test notification",
            details: error?.message
        }, { status: 500 });
    }
}
