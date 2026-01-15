import { NextRequest, NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db";
import { getExternalApiKey } from "@/lib/external-api";

export async function GET(req: NextRequest) {
  const database = await checkDatabaseHealth();
  const apiKeyConfigured = (await getExternalApiKey()) !== null;
  const response = NextResponse.json(
    {
      ok: database,
      database: database ? "connected" : "disconnected",
      apiKey: apiKeyConfigured,
      ts: new Date().toISOString()
    },
    { status: database ? 200 : 503 }
  );
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
