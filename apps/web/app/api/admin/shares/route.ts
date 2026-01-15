import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getAllMediaShares } from "@/db";
import { resolvePublicBaseUrl } from "@/lib/server-utils";

export async function GET(request: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const shares = await getAllMediaShares();
  const baseUrl = resolvePublicBaseUrl(request);

  const response = NextResponse.json({ shares, baseUrl });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
