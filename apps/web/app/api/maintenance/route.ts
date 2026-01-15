import { NextResponse } from "next/server";
import { getMaintenanceState } from "@/lib/maintenance";

export const revalidate = 0;

export async function GET() {
  const state = await getMaintenanceState();
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
