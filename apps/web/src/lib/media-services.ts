import { getPool } from "@/db";
import { decryptSecret } from "@/lib/encryption";
import { MediaService, getMediaServiceSecretById } from "@/lib/service-config";

type MediaServiceRow = MediaService & { api_key_encrypted: string };

const CACHE_TTL_MS = 5_000;
const cache = new Map<MediaService["type"], { expiresAt: number; promise: Promise<ActiveMediaService | null> }>();

export type ActiveMediaService = MediaService & { apiKey: string };

export async function getActiveMediaService(type: MediaService["type"]) {
    const now = Date.now();
    const cached = cache.get(type);
    if (cached && cached.expiresAt > now) {
        return cached.promise;
    }

    const promise = loadActiveMediaService(type).catch(err => {
        cache.delete(type);
        throw err;
    });
    cache.set(type, { expiresAt: now + CACHE_TTL_MS, promise });
    return promise;
}

export async function hasActiveMediaService(type: MediaService["type"]) {
    return Boolean(await getActiveMediaService(type));
}

async function loadActiveMediaService(type: MediaService["type"]) {
    const pool = getPool();
    const res = await pool.query<MediaServiceRow>(
        `
        SELECT id, name, type, base_url, config, enabled, created_at, updated_at, api_key_encrypted
        FROM media_service
        WHERE type = $1 AND enabled = TRUE
        ORDER BY created_at DESC
        `,
        [type]
    );

    if (!res.rows.length) {
        return null;
    }

    const defaultService =
        res.rows.find(row => Boolean(row.config?.defaultServer)) ??
        res.rows[0];

    const apiKey = decryptSecret(defaultService.api_key_encrypted);
    const config = (typeof defaultService.config === "object" && defaultService.config) || {};

    return {
        ...defaultService,
        apiKey,
        config
    };
}

export async function getMediaServiceByIdWithKey(id: number) {
    const service = await getMediaServiceSecretById(id);
    if (!service) {
        return null;
    }
    const config = (typeof service.config === "object" && service.config) || {};
    let apiKey = "";
    try {
        apiKey = decryptSecret(service.api_key_encrypted);
    } catch {
        return null;
    }
    return {
        ...service,
        apiKey,
        config
    };
}

export function clearMediaServiceCache(type?: MediaService["type"]) {
    if (type) {
        cache.delete(type);
    } else {
        cache.clear();
    }
}

export async function listActiveMediaServicesOfType(type: MediaService["type"]): Promise<ActiveMediaService[]> {
    const pool = getPool();
    const res = await pool.query<MediaService & { api_key_encrypted: string }>(
        `SELECT id, name, type, base_url, config, enabled, created_at, updated_at, api_key_encrypted
         FROM media_service WHERE type = $1 AND enabled = TRUE ORDER BY created_at`,
        [type]
    );
    return res.rows.map(row => ({
        ...row,
        apiKey: decryptSecret(row.api_key_encrypted),
        config: (typeof row.config === "object" && row.config) || {},
    }));
}

export async function listAllActiveMediaServices(): Promise<ActiveMediaService[]> {
    const pool = getPool();
    const res = await pool.query<MediaService & { api_key_encrypted: string }>(
        `SELECT id, name, type, base_url, config, enabled, created_at, updated_at, api_key_encrypted
         FROM media_service WHERE enabled = TRUE ORDER BY type, created_at`
    );
    return res.rows.map(row => ({
        ...row,
        apiKey: decryptSecret(row.api_key_encrypted),
        config: (typeof row.config === "object" && row.config) || {},
    }));
}
