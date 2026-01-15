import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import nodemailer from "nodemailer";
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

        // Create nodemailer transporter
        const transporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.encryption === "tls",
            auth: {
                user: config.authUser,
                pass: config.authPass,
            },
            tls: {
                rejectUnauthorized: !config.allowSelfSigned,
            },
        });

        // Send test email
        await transporter.sendMail({
            from: `"${config.senderName}" <${config.senderAddress}>`,
            to: config.senderAddress,
            subject: "LeMedia Test Notification",
            text: "This is a test notification from LeMedia. If you received this, your email notifications are working correctly!",
            html: `
        <h2>LeMedia Test Notification</h2>
        <p>This is a test notification from LeMedia.</p>
        <p>If you received this, your email notifications are working correctly!</p>
      `,
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
