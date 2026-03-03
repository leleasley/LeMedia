import { NextRequest, NextResponse } from "next/server";
import { getThirdPartyAuthSettings } from "@/db";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  const settings = await getThirdPartyAuthSettings();

  return jsonResponseWithETag(req, {
    providers: {
      google: Boolean(settings.google.enabled && settings.google.clientId.trim() && settings.google.clientSecret.trim()),
      github: Boolean(settings.github.enabled && settings.github.clientId.trim() && settings.github.clientSecret.trim()),
      telegram: Boolean(settings.telegram.enabled && settings.telegram.clientId.trim() && settings.telegram.clientSecret.trim())
    }
  });
}
