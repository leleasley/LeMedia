import { NextRequest, NextResponse } from "next/server";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  const imageProxyEnabled = await getImageProxyEnabled();
  return cacheableJsonResponseWithETag(req, { image_proxy_enabled: imageProxyEnabled }, { maxAge: 60, sMaxAge: 120 });
}
