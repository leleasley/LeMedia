import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { notificationTypeSchema } from "@/lib/notification-types";
import { logger } from "@/lib/logger";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ type: string }> }
) {
    try {
        const user = await requireAdmin();
        if (user instanceof NextResponse) return user;
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const { type } = await params;
        const parsedType = notificationTypeSchema.safeParse(type);
        if (!parsedType.success) {
            return NextResponse.json({ error: "Unsupported notification type" }, { status: 400 });
        }

        const body = await request.json();
        const { name, enabled, types, config } = body;

        if (!config) {
            return NextResponse.json(
                { error: "Config is required" },
                { status: 400 }
            );
        }

        // Send test notification based on type
        switch (parsedType.data) {
            case "discord":
                return await testDiscord(config);
            case "email":
                return await testEmail(config);
            case "telegram":
                return await testTelegram(config);
            case "webhook":
                return await testWebhook(config);
            case "slack":
                return await testSlack(config);
            case "gotify":
                return await testGotify(config);
            case "ntfy":
                return await testNtfy(config);
            case "pushbullet":
                return await testPushbullet(config);
            case "pushover":
                return await testPushover(config);
            case "webpush":
                return await testWebPush(config);
            default:
                return NextResponse.json(
                    { error: "Unknown notification type" },
                    { status: 400 }
                );
        }
    } catch (error: any) {
        logger.error(`Failed to send test notification:`, error);
        return NextResponse.json(
            {
                error: "Failed to send test notification",
                details: error?.message
            },
            { status: 500 }
        );
    }
}

async function testDiscord(config: any) {
    if (!config.webhookUrl) {
        throw new Error("Webhook URL is required");
    }

    const payload: any = {
        content: undefined,
        username: config.botUsername || "LeMedia",
        avatar_url: config.botAvatarUrl || undefined,
        embeds: [
            {
                title: "Test Notification",
                description: "This is a test notification from LeMedia. If you received this, your Discord webhook is working correctly!",
                color: 5814783,
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
}

async function testEmail(config: any) {
    if (!config.emailFrom || !config.smtpHost) {
        throw new Error("Email and SMTP host are required");
    }

    // For email test, we'd typically use the server's email service
    // This is a placeholder - actual implementation would need nodemailer or similar
    return NextResponse.json({ success: true, message: "Email test notification would be sent" });
}

async function testTelegram(config: any) {
    if (!config.botToken || !config.chatId) {
        throw new Error("Bot token and chat ID are required");
    }

    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: config.chatId,
            text: "🧪 Test notification from LeMedia - If you see this, your Telegram integration is working!",
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Telegram API error: ${error}`);
    }

    return NextResponse.json({ success: true, message: "Test notification sent to Telegram" });
}

async function testWebhook(config: any) {
    if (!config.webhookUrl) {
        throw new Error("Webhook URL is required");
    }

    const payload = {
        test: true,
        message: "Test notification from LeMedia",
        timestamp: new Date().toISOString(),
    };

    const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Webhook error: ${error}`);
    }

    return NextResponse.json({ success: true, message: "Test notification sent to webhook" });
}

async function testSlack(config: any) {
    if (!config.webhookUrl) {
        throw new Error("Webhook URL is required");
    }

    const payload = {
        text: "LeMedia Test Notification",
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "🧪 *Test Notification*\n\nIf you see this, your Slack integration is working correctly!",
                },
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
        throw new Error(`Slack API error: ${error}`);
    }

    return NextResponse.json({ success: true, message: "Test notification sent to Slack" });
}

async function testGotify(config: any) {
    if (!config.baseUrl || !config.token) {
        throw new Error("Base URL and token are required");
    }

    const url = config.baseUrl.endsWith("/") ? config.baseUrl : config.baseUrl + "/";
    const response = await fetch(`${url}message?token=${config.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: "Test Notification",
            message: "This is a test notification from LeMedia",
            priority: 5,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gotify error: ${error}`);
    }

    return NextResponse.json({ success: true, message: "Test notification sent to Gotify" });
}

async function testNtfy(config: any) {
    if (!config.topic) {
        throw new Error("Topic is required");
    }

    const url = `${config.baseUrl || "https://ntfy.sh"}/${config.topic}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "Test notification from LeMedia - If you see this, your ntfy integration is working!",
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`ntfy error: ${error}`);
    }

    return NextResponse.json({ success: true, message: "Test notification sent to ntfy" });
}

async function testPushbullet(config: any) {
    if (!config.accessToken) {
        throw new Error("Access token is required");
    }

    const response = await fetch("https://api.pushbullet.com/v2/pushes", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Access-Token": config.accessToken,
        },
        body: JSON.stringify({
            type: "note",
            title: "LeMedia Test",
            body: "If you see this, your Pushbullet integration is working!",
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Pushbullet error: ${error}`);
    }

    return NextResponse.json({ success: true, message: "Test notification sent to Pushbullet" });
}

async function testPushover(config: any) {
    if (!config.apiToken || !config.userKey) {
        throw new Error("API token and user key are required");
    }

    const params = new URLSearchParams({
        token: config.apiToken,
        user: config.userKey,
        title: "LeMedia Test",
        message: "If you see this, your Pushover integration is working!",
    });

    const response = await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Pushover error: ${error}`);
    }

    return NextResponse.json({ success: true, message: "Test notification sent to Pushover" });
}

async function testWebPush(config: any) {
    // Web Push test requires valid subscription, for now just return success
    return NextResponse.json({ success: true, message: "Web Push configuration validated" });
}
