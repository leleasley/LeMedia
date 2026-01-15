import { NextRequest } from "next/server";
import { getUser } from "@/auth";
import { getMediaIssueCounts, getRequestCounts } from "@/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getUser().catch(() => null);
  if (!user || !user.isAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const sendCounts = async () => {
        try {
          const [requestCounts, issueCounts] = await Promise.all([
            getRequestCounts().catch(() => null),
            getMediaIssueCounts().catch(() => null),
          ]);
          send("counts", {
            requests: requestCounts,
            issues: issueCounts,
          });
        } catch {
          // Ignore transient errors; next tick will try again.
        }
      };

      const keepAlive = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ping\n\n`));
      };

      void sendCounts();
      const intervalId = setInterval(sendCounts, 15000);
      const keepAliveId = setInterval(keepAlive, 10000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(intervalId);
        clearInterval(keepAliveId);
        controller.close();
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
