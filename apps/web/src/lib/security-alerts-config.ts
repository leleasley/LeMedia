import { getSetting, setSetting } from "@/db";
import { z } from "zod";

export type SecurityAlertsConfig = {
  enabled: boolean;
  loginFailureEnabled: boolean;
  newUserEnabled: boolean;
  mfaFailureEnabled: boolean;
  endpointIds: number[];
  cooldownMs: number;
};

export const SECURITY_ALERTS_CONFIG_DEFAULTS: SecurityAlertsConfig = {
  enabled: false,
  loginFailureEnabled: true,
  newUserEnabled: true,
  mfaFailureEnabled: true,
  endpointIds: [],
  cooldownMs: 10 * 60 * 1000,
};

const SecurityAlertsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  loginFailureEnabled: z.boolean().optional(),
  newUserEnabled: z.boolean().optional(),
  mfaFailureEnabled: z.boolean().optional(),
  endpointIds: z.array(z.number().int().positive()).optional(),
  cooldownMs: z.number().int().min(1000).max(86_400_000).optional(),
});

const SETTING_KEY = "security_alerts_config";

export async function getSecurityAlertsConfig(): Promise<SecurityAlertsConfig> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return SECURITY_ALERTS_CONFIG_DEFAULTS;
  try {
    const parsed = SecurityAlertsConfigSchema.parse(JSON.parse(raw));
    return {
      ...SECURITY_ALERTS_CONFIG_DEFAULTS,
      ...parsed,
      endpointIds: Array.from(
        new Set((parsed.endpointIds ?? []).filter((id) => Number.isFinite(id) && id > 0))
      ),
    };
  } catch {
    return SECURITY_ALERTS_CONFIG_DEFAULTS;
  }
}

export async function setSecurityAlertsConfig(
  input: SecurityAlertsConfig
): Promise<SecurityAlertsConfig> {
  const parsed = SecurityAlertsConfigSchema.parse(input);
  const normalized: SecurityAlertsConfig = {
    ...SECURITY_ALERTS_CONFIG_DEFAULTS,
    ...parsed,
    endpointIds: Array.from(
      new Set((parsed.endpointIds ?? []).filter((id) => Number.isFinite(id) && id > 0))
    ),
  };
  await setSetting(SETTING_KEY, JSON.stringify(normalized));
  return normalized;
}
