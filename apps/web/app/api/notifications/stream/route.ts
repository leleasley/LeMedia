import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUnreadNotificationCount, getUnreadNotifications, upsertUser } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationSnapshot = {
  notifications: Array<{
    id: number;
    type: string;
    message: string;
    title: string;
    link?: string | null;
    createdAt: string;
    isRead: boolean;
    metadata: Record<string, unknown>;
  }>;
  unreadCount: number;
};

async function buildSnapshot(userId: number): Promise<NotificationSnapshot> {
  const [notifications, unreadCount] = await Promise.all([
    getUnreadNotifications(userId),
    getUnreadNotificationCount(userId),
  ]);

  return {
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      message: notification.message,
      title: notification.title,
      link: notification.link,
      createdAt: notification.createdAt,
      isRead: notification.isRead,
      metadata: (notification.metadata as Record<string, unknown> | null) ?? {},
    })),
    unreadCount,
  };
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id: userId } = await upsertUser(user.username, user.groups);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let running = true;
      let lastSnapshot = "";

      const send = (event: string, data: unknown) => {
        if (!running) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          running = false;
        }
      };

      const sendSnapshot = async () => {
        try {
          const snapshot = await buildSnapshot(userId);
          const serialized = JSON.stringify(snapshot);
          if (serialized === lastSnapshot) return;
          lastSnapshot = serialized;
          send("notifications", snapshot);
        } catch {
          // Ignore transient errors and retry on next tick.
        }
      };

      req.signal.addEventListener("abort", () => {
        running = false;
      });

      send("connected", { ok: true });
      await sendSnapshot();

      let tick = 0;
      while (running) {
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
        if (!running) break;

        await sendSnapshot();
        tick += 1;

        if (tick % 4 === 0) {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
          } catch {
            running = false;
            break;
          }
        }
      }

      try {
        controller.close();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}