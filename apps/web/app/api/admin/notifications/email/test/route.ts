import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/notifications/email";

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

        const to = String(config.senderAddress || config.emailFrom || "").trim();
        if (!to) {
            throw new Error("Recipient address is required");
        }

        await sendEmail({
            to,
            subject: "LeMedia Test Notification",
            text: "This is a test notification from LeMedia. If you received this, your email notifications are working correctly!",
            html: `
        <h2>LeMedia Test Notification</h2>
        <p>This is a test notification from LeMedia.</p>
        <p>If you received this, your email notifications are working correctly!</p>
      `,
            smtp: config,
        });

        return NextResponse.json({ success: true, message: "Test email sent successfully" });
    } catch (error: any) {
        logger.error("Failed to send test email:", error);
        return NextResponse.json({
            error: "Failed to send test email",
            details: error?.message
        }, { status: 500 });
    }
}
