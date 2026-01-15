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

        const url = new URL(`/${config.topic}`, config.url);

        const headers: HeadersInit = {
            "Title": "LeMedia Test Notification",
            "Priority": String(config.priority || 3),
            "Tags": "test,notification",
        };

        if (config.authMethod === "basic" && config.username && config.password) {
            const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
            headers["Authorization"] = `Basic ${auth}`;
        } else if (config.authMethod === "token" && config.token) {
            headers["Authorization"] = `Bearer ${config.token}`;
        }

        const response = await fetch(url.toString(), {
            method: "POST",
            headers,
            body: "This is a test notification from LeMedia. If you received this, your ntfy integration is working correctly!",
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Ntfy error (${response.status}): ${error}`);
        }

        return NextResponse.json({ success: true, message: "Test notification sent to ntfy" });
    } catch (error: any) {
        logger.error("Failed to send Ntfy test:", error);
        return NextResponse.json({
            error: "Failed to send test notification",
            details: error?.message
        }, { status: 500 });
    }
}
