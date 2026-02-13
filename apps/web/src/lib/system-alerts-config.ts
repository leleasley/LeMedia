import { getSetting, setSetting } from "@/db";
import { z } from "zod";

export type SystemAlertsConfig = {
  enabled: boolean;
  highLatencyEnabled: boolean;
  serviceUnreachableEnabled: boolean;
  indexersUnavailableEnabled: boolean;
  includeGlobalEndpoints: boolean;
  targetUserIds: number[];
  latencyThresholdMs: number;
  requestTimeoutMs: number;
  cooldownMs: number;
};

export const SYSTEM_ALERTS_CONFIG_DEFAULTS: SystemAlertsConfig = {
  enabled: true,
  highLatencyEnabled: true,
  serviceUnreachableEnabled: true,
  indexersUnavailableEnabled: true,
  includeGlobalEndpoints: true,
  targetUserIds: [],
  latencyThresholdMs: 40_000,
  requestTimeoutMs: 45_000,
  cooldownMs: 15 * 60 * 1000
};

const SystemAlertsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  highLatencyEnabled: z.boolean().optional(),
  serviceUnreachableEnabled: z.boolean().optional(),
  indexersUnavailableEnabled: z.boolean().optional(),
  includeGlobalEndpoints: z.boolean().optional(),
  targetUserIds: z.array(z.number().int().positive()).optional(),
  latencyThresholdMs: z.number().int().min(1000).max(600_000).optional(),
  requestTimeoutMs: z.number().int().min(1000).max(600_000).optional(),
  cooldownMs: z.number().int().min(1000).max(86_400_000).optional()
});

const SETTING_KEY = "system_alerts_config";

export async function getSystemAlertsConfig(): Promise<SystemAlertsConfig> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return SYSTEM_ALERTS_CONFIG_DEFAULTS;
  try {
    const parsed = SystemAlertsConfigSchema.parse(JSON.parse(raw));
    return {
      ...SYSTEM_ALERTS_CONFIG_DEFAULTS,
      ...parsed
    };
  } catch {
    return SYSTEM_ALERTS_CONFIG_DEFAULTS;
  }
}

export async function setSystemAlertsConfig(input: SystemAlertsConfig): Promise<SystemAlertsConfig> {
  const parsed = SystemAlertsConfigSchema.parse(input);
  const normalized: SystemAlertsConfig = {
    ...SYSTEM_ALERTS_CONFIG_DEFAULTS,
    ...parsed
  };
  await setSetting(SETTING_KEY, JSON.stringify(normalized));
  return normalized;
}
