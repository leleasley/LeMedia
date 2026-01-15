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

        // Replace template variables with test data
        const testPayload = config.jsonPayload
            .replace(/\{\{notification_type\}\}/g, "TEST")
            .replace(/\{\{event\}\}/g, "test")
            .replace(/\{\{subject\}\}/g, "Test Notification")
            .replace(/\{\{message\}\}/g, "This is a test notification from LeMedia")
            .replace(/\{\{image\}\}/g, "https://example.com/test.jpg")
            .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
            .replace(/\{\{media_type\}\}/g, "movie")
            .replace(/\{\{media_tmdbid\}\}/g, "12345")
            .replace(/\{\{media_tvdbid\}\}/g, "67890")
            .replace(/\{\{media_status\}\}/g, "available")
            .replace(/\{\{media_status4k\}\}/g, "unknown")
            .replace(/\{\{request_id\}\}/g, "test-123")
            .replace(/\{\{requestedBy_email\}\}/g, "test@example.com")
            .replace(/\{\{requestedBy_username\}\}/g, user.username)
            .replace(/\{\{requestedBy_avatar\}\}/g, "");

        const headers: HeadersInit = {
            "Content-Type": "application/json",
        };

        if (config.authHeader) {
            headers["Authorization"] = config.authHeader;
        }

        const response = await fetch(config.webhookUrl, {
            method: "POST",
            headers,
            body: testPayload,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Webhook error (${response.status}): ${error}`);
        }

        return NextResponse.json({ success: true, message: "Test webhook sent successfully" });
    } catch (error: any) {
        logger.error("Failed to send webhook test:", error);
        return NextResponse.json({
            error: "Failed to send test webhook",
            details: error?.message
        }, { status: 500 });
    }
}
