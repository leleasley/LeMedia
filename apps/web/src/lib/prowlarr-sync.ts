import "server-only";
import { logger } from "@/lib/logger";
import { getActiveMediaService } from "@/lib/media-services";
import { createProwlarrFetcher } from "@/lib/prowlarr";

type ProwlarrField = {
  name: string;
  value?: any;
  type?: string;
  label?: string;
  helpText?: string;
  [key: string]: any;
};

type ProwlarrApplication = {
  id?: number;
  name?: string;
  implementation?: string;
  implementationName?: string;
  configContract?: string;
  infoLink?: string;
  tags?: number[];
  syncLevel?: string;
  fields?: ProwlarrField[];
  [key: string]: any;
};

const DEFAULT_SYNC_LEVEL = "fullSync";
const RADARR_SYNC_CATEGORIES = [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060, 2070, 2080];
const SONARR_SYNC_CATEGORIES = [5000, 5010, 5020, 5030, 5040, 5045, 5050, 5060];
const SONARR_ANIME_SYNC_CATEGORIES = [5070];

function findSchemaEntry(list: any[], type: "radarr" | "sonarr") {
  const target = type.toLowerCase();
  return list.find((entry: any) => {
    const haystack = [
      entry?.implementation,
      entry?.implementationName,
      entry?.configContract,
      entry?.name
    ]
      .filter(Boolean)
      .map((value: string) => value.toLowerCase());
    return haystack.some(value => value.includes(target));
  });
}

function getFieldValue(fields: ProwlarrField[] | undefined, name: string) {
  return fields?.find(field => field?.name === name)?.value;
}

function setFieldValue(fields: ProwlarrField[], name: string, value: any) {
  const existing = fields.find(field => field.name === name);
  if (existing) {
    existing.value = value;
  } else {
    fields.push({ name, value });
  }
}

function buildAppPayload(input: {
  schema?: ProwlarrApplication | null;
  existing?: ProwlarrApplication | null;
  name: string;
  prowlarrUrl: string;
  baseUrl: string;
  apiKey: string;
  type: "radarr" | "sonarr";
}) {
  const { schema, existing, name, prowlarrUrl, baseUrl, apiKey, type } = input;
  const basePayload: ProwlarrApplication = {
    ...(schema ?? {}),
    ...(existing ?? {}),
    name,
    syncLevel: DEFAULT_SYNC_LEVEL,
    tags: existing?.tags ?? schema?.tags ?? []
  };

  const fields = Array.isArray(existing?.fields)
    ? existing!.fields.map(field => ({ ...field }))
    : Array.isArray(schema?.fields)
      ? schema!.fields.map(field => ({ ...field }))
      : [];

  setFieldValue(fields, "prowlarrUrl", prowlarrUrl);
  setFieldValue(fields, "baseUrl", baseUrl);
  setFieldValue(fields, "apiKey", apiKey);

  if (type === "radarr") {
    setFieldValue(fields, "syncCategories", RADARR_SYNC_CATEGORIES);
  } else {
    setFieldValue(fields, "syncCategories", SONARR_SYNC_CATEGORIES);
    setFieldValue(fields, "animeSyncCategories", SONARR_ANIME_SYNC_CATEGORIES);
    setFieldValue(fields, "syncAnimeStandardFormatSearch", true);
  }

  basePayload.fields = fields;
  return basePayload;
}

function findMatchingApplication(apps: ProwlarrApplication[], type: "radarr" | "sonarr", baseUrl: string) {
  const target = type.toLowerCase();
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return apps.find(app => {
    const fields = app?.fields ?? [];
    const appBaseUrl = String(getFieldValue(fields, "baseUrl") ?? "").replace(/\/+$/, "");
    const nameMatch = [app?.implementationName, app?.implementation, app?.configContract, app?.name]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(target));
    return nameMatch && (!appBaseUrl || appBaseUrl === normalizedBase);
  });
}

async function triggerProwlarrSync(fetcher: (path: string, init?: RequestInit) => Promise<any>) {
  try {
    await fetcher("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ name: "ApplicationIndexerSync" })
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[Prowlarr Sync] Command ApplicationIndexerSync failed", { message });
  }

  try {
    await fetcher("/api/v1/applications/action/sync", { method: "POST", body: JSON.stringify({}) });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[Prowlarr Sync] applications/action/sync failed", { message });
  }

  return false;
}

export async function syncProwlarrIndexers() {
  const prowlarr = await getActiveMediaService("prowlarr").catch(() => null);
  if (!prowlarr) {
    return { ok: false, message: "Prowlarr not configured", updated: 0, created: 0, synced: false };
  }

  const radarr = await getActiveMediaService("radarr").catch(() => null);
  const sonarr = await getActiveMediaService("sonarr").catch(() => null);

  const fetcher = createProwlarrFetcher(prowlarr.base_url, prowlarr.apiKey);
  const [apps, schema] = await Promise.all([
    fetcher("/api/v1/applications").catch(() => []),
    fetcher("/api/v1/applications/schema").catch(() => [])
  ]);

  const appList: ProwlarrApplication[] = Array.isArray(apps) ? apps : [];
  const schemaList: ProwlarrApplication[] = Array.isArray(schema) ? schema : [];

  let created = 0;
  let updated = 0;

  const syncTargets: Array<{
    type: "radarr" | "sonarr";
    service: { base_url: string; apiKey: string } | null;
    name: string;
  }> = [
    { type: "radarr", service: radarr ? { base_url: radarr.base_url, apiKey: radarr.apiKey } : null, name: "Radarr" },
    { type: "sonarr", service: sonarr ? { base_url: sonarr.base_url, apiKey: sonarr.apiKey } : null, name: "Sonarr" }
  ];

  for (const target of syncTargets) {
    if (!target.service) continue;
    const existing = findMatchingApplication(appList, target.type, target.service.base_url);
    const schemaEntry = findSchemaEntry(schemaList, target.type);
    const payload = buildAppPayload({
      schema: schemaEntry ?? null,
      existing: existing ?? null,
      name: target.name,
      prowlarrUrl: prowlarr.base_url,
      baseUrl: target.service.base_url,
      apiKey: target.service.apiKey,
      type: target.type
    });

    if (existing?.id) {
      await fetcher(`/api/v1/applications/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...existing, ...payload, id: existing.id })
      });
      updated += 1;
    } else {
      await fetcher("/api/v1/applications", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      created += 1;
    }
  }

  const synced = await triggerProwlarrSync(fetcher);
  return {
    ok: true,
    message: "Prowlarr applications synced",
    created,
    updated,
    synced
  };
}
