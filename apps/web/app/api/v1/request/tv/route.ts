import { NextRequest, NextResponse } from "next/server";
import { verifyExternalApiKey } from "@/lib/external-api";
import { POST as basePost } from "../../../request/tv/route";
import { POST as requestPost } from "../route";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

export async function POST(req: NextRequest) {
  const apiKey = extractApiKey(req);
  if (apiKey) {
    const ok = await verifyExternalApiKey(apiKey);
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const mediaIdRaw = body?.mediaId ?? body?.tmdbId ?? body?.id;
    const mediaId = Number(mediaIdRaw);
    if (!Number.isFinite(mediaId)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const payload: Record<string, unknown> = { mediaType: "tv", mediaId };
    if (body?.seasons !== undefined) {
      payload.seasons = body.seasons;
    }

    const headers = new Headers(req.headers);
    headers.set("content-type", "application/json");
    const proxyRequest = new NextRequest(
      new Request("http://internal/api/v1/request", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      })
    );
    return requestPost(proxyRequest);
  }

  return basePost(req);
}
