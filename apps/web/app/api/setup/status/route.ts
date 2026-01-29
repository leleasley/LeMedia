import { NextResponse } from "next/server";
import { isSetupComplete, getUserCount } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [setupComplete, userCount] = await Promise.all([
      isSetupComplete(),
      getUserCount(),
    ]);

    return NextResponse.json({
      setupRequired: !setupComplete,
      hasUsers: userCount > 0,
    });
  } catch (error) {
    console.error("[Setup] Failed to check setup status:", error);
    return NextResponse.json(
      { error: "Failed to check setup status" },
      { status: 500 }
    );
  }
}
