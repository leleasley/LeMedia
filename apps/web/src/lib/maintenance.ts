import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getSetting, setSetting } from "@/db";

export type MaintenanceState = {
  enabled: boolean;
  message?: string | null;
  updatedAt?: string | null;
};

const MAINTENANCE_KEY = "maintenance_mode";

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const raw = await getSetting(MAINTENANCE_KEY);
  if (!raw) return { enabled: false };

  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed?.enabled,
      message: typeof parsed?.message === "string" ? parsed.message : null,
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : null
    };
  } catch {
    return { enabled: raw === "1" || raw === "true" };
  }
}

export async function setMaintenanceState(state: { enabled: boolean; message?: string | null }) {
  const payload: MaintenanceState = {
    enabled: !!state.enabled,
    message: state.message?.trim() || undefined,
    updatedAt: new Date().toISOString()
  };
  await setSetting(MAINTENANCE_KEY, JSON.stringify(payload));
  return payload;
}

export async function rejectIfMaintenance(req: NextRequest) {
  const state = await getMaintenanceState();
  if (!state.enabled) return null;

  const body: Record<string, any> = {
    error: "Requests are temporarily disabled for maintenance",
    maintenance: true
  };
  if (state.message) body.message = state.message;
  if (state.updatedAt) body.updatedAt = state.updatedAt;

  return NextResponse.json(body, {
    status: 503,
    headers: { "Retry-After": "600" }
  });
}
