import { getJellyfinConfig, getSetting, setSetting } from "@/db";
import { decryptSecret } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { getMediaServiceSecretById, listMediaServices } from "@/lib/service-config";
import { getSystemAlertsConfig } from "@/lib/system-alerts-config";
import { notifySystemAlertEventWithDelivery } from "@/notifications/system-events";

type AlertStateEntry = {
  active: boolean;
  lastSentAt: string | null;
};

type AlertState = Record<string, AlertStateEntry>;

const ALERT_STATE_KEY = "system_alert_state";

async function loadAlertState(): Promise<AlertState> {
  const raw = await getSetting(ALERT_STATE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveAlertState(state: AlertState): Promise<void> {
  await setSetting(ALERT_STATE_KEY, JSON.stringify(state));
}

function shouldEmitAlert(state: AlertState, key: string, now: Date, cooldownMs: number): boolean {
  const entry = state[key];
  if (!entry) return true;
  const lastSentMs = entry.lastSentAt ? Date.parse(entry.lastSentAt) : Number.NaN;
  if (!Number.isFinite(lastSentMs)) return true;
  return now.getTime() - lastSentMs >= cooldownMs;
}

function markActive(state: AlertState, key: string, now: Date) {
  state[key] = { active: true, lastSentAt: now.toISOString() };
}

function clearActive(state: AlertState, key: string) {
  const existing = state[key];
  if (!existing) return;
  state[key] = { ...existing, active: false };
}

function getServiceStatusPath(type: string): string | null {
  if (type === "radarr" || type === "sonarr") return "/api/v3/system/status";
  if (type === "prowlarr") return "/api/v1/system/status";
  return null;
}

async function timedFetch(url: string, init: RequestInit, timeoutMs: number) {
  const started = Date.now();
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  return { response, elapsedMs: Date.now() - started };
}

export async function runSystemAlertChecks() {
  const config = await getSystemAlertsConfig();
  if (!config.enabled) {
    logger.info("[System Alerts] Skipped: disabled in settings");
    return;
  }

  const thresholdMs = config.latencyThresholdMs;
  const timeoutMs = config.requestTimeoutMs;
  const cooldownMs = config.cooldownMs;
  const delivery = {
    includeGlobalEndpoints: config.includeGlobalEndpoints,
    userIds: config.targetUserIds
  };

  const now = new Date();
  const state = await loadAlertState();

  const services = await listMediaServices();
  for (const svc of services.filter((s) => s.enabled)) {
    const statusPath = getServiceStatusPath(svc.type);
    if (!statusPath) continue;

    const keyPrefix = `${svc.type}:${svc.id}`;
    const unreachableKey = `system_alert_service_unreachable:${keyPrefix}`;
    const latencyKey = `system_alert_high_latency:${keyPrefix}`;

    try {
      const secret = await getMediaServiceSecretById(svc.id);
      if (!secret) {
        clearActive(state, unreachableKey);
        clearActive(state, latencyKey);
        continue;
      }

      const apiKey = decryptSecret(secret.api_key_encrypted);
      const url = `${secret.base_url.replace(/\/+$/, "")}${statusPath}`;
      const { response, elapsedMs } = await timedFetch(url, { headers: { "X-Api-Key": apiKey } }, timeoutMs);

      if (!response.ok && config.serviceUnreachableEnabled) {
        if (shouldEmitAlert(state, unreachableKey, now, cooldownMs)) {
          await notifySystemAlertEventWithDelivery("system_alert_service_unreachable", {
            title: `${svc.name} is unreachable`,
            serviceName: svc.name,
            serviceType: svc.type,
            details: `Health endpoint returned HTTP ${response.status}.`,
            metadata: { status: response.status, serviceId: svc.id }
          }, delivery);
          markActive(state, unreachableKey, now);
        }
      } else {
        clearActive(state, unreachableKey);
      }

      if (config.highLatencyEnabled && elapsedMs > thresholdMs) {
        if (shouldEmitAlert(state, latencyKey, now, cooldownMs)) {
          await notifySystemAlertEventWithDelivery("system_alert_high_latency", {
            title: `${svc.name} latency exceeded threshold`,
            serviceName: svc.name,
            serviceType: svc.type,
            latencyMs: elapsedMs,
            thresholdMs,
            details: `Health check took ${elapsedMs} ms.`,
            metadata: { serviceId: svc.id }
          }, delivery);
          markActive(state, latencyKey, now);
        }
      } else {
        clearActive(state, latencyKey);
      }
    } catch (err) {
      if (config.serviceUnreachableEnabled && shouldEmitAlert(state, unreachableKey, now, cooldownMs)) {
        await notifySystemAlertEventWithDelivery("system_alert_service_unreachable", {
          title: `${svc.name} is unreachable`,
          serviceName: svc.name,
          serviceType: svc.type,
          details: err instanceof Error ? err.message : String(err),
          metadata: { serviceId: svc.id }
        }, delivery);
        markActive(state, unreachableKey, now);
      } else {
        clearActive(state, unreachableKey);
      }
      clearActive(state, latencyKey);
    }
  }

  const jellyfinConfig = await getJellyfinConfig();
  if (jellyfinConfig.hostname && jellyfinConfig.apiKeyEncrypted) {
    const unreachableKey = "system_alert_service_unreachable:jellyfin";
    const latencyKey = "system_alert_high_latency:jellyfin";
    try {
      const apiKey = decryptSecret(jellyfinConfig.apiKeyEncrypted);
      const port = jellyfinConfig.port ? `:${jellyfinConfig.port}` : "";
      const basePath = jellyfinConfig.urlBase
        ? jellyfinConfig.urlBase.startsWith("/")
          ? jellyfinConfig.urlBase
          : `/${jellyfinConfig.urlBase}`
        : "";
      const url = `${jellyfinConfig.useSsl ? "https" : "http"}://${jellyfinConfig.hostname}${port}${basePath}/System/Info`;
      const { response, elapsedMs } = await timedFetch(url, { headers: { "X-Emby-Token": apiKey } }, timeoutMs);

      if (!response.ok && config.serviceUnreachableEnabled) {
        if (shouldEmitAlert(state, unreachableKey, now, cooldownMs)) {
          await notifySystemAlertEventWithDelivery("system_alert_service_unreachable", {
            title: "Jellyfin is unreachable",
            serviceName: "Jellyfin",
            serviceType: "jellyfin",
            details: `Health endpoint returned HTTP ${response.status}.`,
            metadata: { status: response.status }
          }, delivery);
          markActive(state, unreachableKey, now);
        }
      } else {
        clearActive(state, unreachableKey);
      }

      if (config.highLatencyEnabled && elapsedMs > thresholdMs) {
        if (shouldEmitAlert(state, latencyKey, now, cooldownMs)) {
          await notifySystemAlertEventWithDelivery("system_alert_high_latency", {
            title: "Jellyfin latency exceeded threshold",
            serviceName: "Jellyfin",
            serviceType: "jellyfin",
            latencyMs: elapsedMs,
            thresholdMs,
            details: `Health check took ${elapsedMs} ms.`
          }, delivery);
          markActive(state, latencyKey, now);
        }
      } else {
        clearActive(state, latencyKey);
      }
    } catch (err) {
      if (config.serviceUnreachableEnabled && shouldEmitAlert(state, unreachableKey, now, cooldownMs)) {
        await notifySystemAlertEventWithDelivery("system_alert_service_unreachable", {
          title: "Jellyfin is unreachable",
          serviceName: "Jellyfin",
          serviceType: "jellyfin",
          details: err instanceof Error ? err.message : String(err)
        }, delivery);
        markActive(state, unreachableKey, now);
      } else {
        clearActive(state, unreachableKey);
      }
      clearActive(state, latencyKey);
    }
  }

  const prowlarr = services.find((svc) => svc.enabled && svc.type === "prowlarr");
  const indexerKey = "system_alert_indexers_unavailable:prowlarr";
  if (prowlarr) {
    try {
      const secret = await getMediaServiceSecretById(prowlarr.id);
      if (!secret) {
        clearActive(state, indexerKey);
      } else {
        const apiKey = decryptSecret(secret.api_key_encrypted);
        const url = `${secret.base_url.replace(/\/+$/, "")}/api/v1/indexer`;
        const { response } = await timedFetch(url, { headers: { "X-Api-Key": apiKey } }, timeoutMs);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json().catch(() => []);
        const indexers = Array.isArray(payload) ? payload : [];
        const enabledCount = indexers.filter((indexer: any) => indexer?.enable === true).length;

        if (config.indexersUnavailableEnabled && enabledCount <= 0) {
          if (shouldEmitAlert(state, indexerKey, now, cooldownMs)) {
            await notifySystemAlertEventWithDelivery("system_alert_indexers_unavailable", {
              title: "No enabled Prowlarr indexers available",
              serviceName: prowlarr.name,
              serviceType: "prowlarr",
              details: "Prowlarr returned zero enabled indexers.",
              metadata: { serviceId: prowlarr.id }
            }, delivery);
            markActive(state, indexerKey, now);
          }
        } else {
          clearActive(state, indexerKey);
        }
      }
    } catch (err) {
      if (config.indexersUnavailableEnabled && shouldEmitAlert(state, indexerKey, now, cooldownMs)) {
        await notifySystemAlertEventWithDelivery("system_alert_indexers_unavailable", {
          title: "Prowlarr indexer status check failed",
          serviceName: prowlarr.name,
          serviceType: "prowlarr",
          details: err instanceof Error ? err.message : String(err),
          metadata: { serviceId: prowlarr.id }
        }, delivery);
        markActive(state, indexerKey, now);
      } else {
        clearActive(state, indexerKey);
      }
    }
  } else {
    clearActive(state, indexerKey);
  }

  await saveAlertState(state);
  logger.info("[System Alerts] Health checks complete");
}
