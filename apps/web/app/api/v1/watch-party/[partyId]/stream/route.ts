import { NextRequest } from "next/server";
import {
  getLatestWatchPartyMessageId,
  getPartyWithContext,
  listWatchPartyMessagesAfter,
  resolveWatchPartyId,
} from "@/db/watch-party";
import { resolveDbUser } from "../../_shared";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> | { partyId: string } }
) {
  const { response: authResponse, dbUser } = await resolveDbUser();
  if (authResponse) return authResponse;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return new Response("Not found", { status: 404 });

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.participant) return new Response("Forbidden", { status: 403 });
  if (context.party.status !== "active") return new Response("Party ended", { status: 410 });

  // Use the current max message id as the SSE starting point
  // so we only stream NEW messages, not history (client has history from initial load)
  let lastId = await getLatestWatchPartyMessageId(partyId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // controller may already be closed
        }
      };

      send("connected", { lastMessageId: lastId });

      let running = true;
      req.signal.addEventListener("abort", () => {
        running = false;
      });

      let tick = 0;
      while (running) {
        await new Promise<void>((r) => setTimeout(r, 1000));
        if (!running) break;

        try {
          const newMessages = await listWatchPartyMessagesAfter(partyId, lastId);
          if (newMessages.length > 0) {
            lastId = newMessages[newMessages.length - 1].id;
            send("messages", { messages: newMessages });
          }
        } catch {
          // DB hiccup — keep stream alive, next tick will retry
        }

        tick++;
        // Send a keepalive comment every 20 seconds to prevent proxy timeouts
        if (tick % 20 === 0) {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
          } catch {
            break;
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx/proxy buffering
    },
  });
}
