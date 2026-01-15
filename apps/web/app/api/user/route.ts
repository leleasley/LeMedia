import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    return cacheableJsonResponseWithETag(req, user, { maxAge: 0, sMaxAge: 0, private: true });
  } catch (err) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
