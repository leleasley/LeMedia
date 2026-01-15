import { NextRequest, NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/web-push";

export async function GET(req: NextRequest) {
  const publicKey = getVapidPublicKey();
  
  if (!publicKey) {
    return NextResponse.json(
      { error: "Push notifications not configured" },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey });
}
