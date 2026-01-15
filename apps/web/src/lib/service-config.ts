import { getPool } from "@/db";
import { encryptSecret, decryptSecret } from "@/lib/encryption";
import { z } from "zod";

const ServiceTypeSchema = z.enum(["radarr", "sonarr"]);

const serviceConfigSchema = z
    .object({})
    .passthrough()
    .default({});

const createServiceSchema = z.object({
    name: z.string().min(1),
    type: ServiceTypeSchema,
    baseUrl: z.string().min(1),
    apiKey: z.string().min(1),
    config: serviceConfigSchema,
    enabled: z.boolean().optional()
});

const updateServiceSchema = z.object({
    name: z.string().min(1).optional(),
    type: ServiceTypeSchema.optional(),
    baseUrl: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
    config: serviceConfigSchema.optional(),
    enabled: z.boolean().optional()
});

export type MediaService = {
    id: number;
    name: string;
    type: z.infer<typeof ServiceTypeSchema>;
    base_url: string;
    config: Record<string, unknown>;
    enabled: boolean;
    created_at: string;
    updated_at: string;
};

export type MediaServiceSecret = MediaService & { api_key_encrypted: string };

export async function listMediaServices() {
    const pool = getPool();
    const res = await pool.query(
        `
        SELECT id, name, type, base_url, config, enabled, created_at, updated_at
        FROM media_service
        ORDER BY created_at DESC
        `
    );
    return res.rows as MediaService[];
}

export async function getMediaServiceById(id: number) {
    const pool = getPool();
    const res = await pool.query(
        `
        SELECT id, name, type, base_url, config, enabled, created_at, updated_at
        FROM media_service
        WHERE id = $1
        LIMIT 1
        `,
        [id]
    );
    if (!res.rows.length) return null;
    return res.rows[0] as MediaService;
}

export async function getMediaServiceSecretById(id: number) {
    const pool = getPool();
    const res = await pool.query(
        `
        SELECT id, name, type, base_url, config, enabled, created_at, updated_at, api_key_encrypted
        FROM media_service
        WHERE id = $1
        LIMIT 1
        `,
        [id]
    );
    if (!res.rows.length) return null;
    return res.rows[0] as MediaServiceSecret;
}

export async function createMediaService(input: z.infer<typeof createServiceSchema>) {
    const parsed = createServiceSchema.parse(input);
    const pool = getPool();
    const encryptedKey = encryptSecret(parsed.apiKey);
    const res = await pool.query(
        `
        INSERT INTO media_service (name, type, base_url, api_key_encrypted, config, enabled)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, type, base_url, config, enabled, created_at, updated_at
        `,
        [parsed.name, parsed.type, parsed.baseUrl, encryptedKey, parsed.config, parsed.enabled ?? true]
    );
    return res.rows[0] as MediaService;
}

export async function updateMediaService(id: number, input: z.infer<typeof updateServiceSchema>) {
    const parsed = updateServiceSchema.parse(input);
    const pool = getPool();
    const updates: string[] = [];
    const values: any[] = [];
    if (parsed.name !== undefined) {
        values.push(parsed.name);
        updates.push(`name = $${values.length}`);
    }
    if (parsed.type !== undefined) {
        values.push(parsed.type);
        updates.push(`type = $${values.length}`);
    }
    if (parsed.baseUrl !== undefined) {
        values.push(parsed.baseUrl);
        updates.push(`base_url = $${values.length}`);
    }
    if (parsed.config !== undefined) {
        values.push(parsed.config);
        updates.push(`config = $${values.length}`);
    }
    if (parsed.enabled !== undefined) {
        values.push(parsed.enabled);
        updates.push(`enabled = $${values.length}`);
    }
    if (parsed.apiKey !== undefined) {
        const encryptedKey = encryptSecret(parsed.apiKey);
        values.push(encryptedKey);
        updates.push(`api_key_encrypted = $${values.length}`);
    }
    if (!updates.length) {
        return getMediaServiceById(id);
    }
    values.push(id);
    const res = await pool.query(
        `
        UPDATE media_service
        SET ${updates.join(", ")}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING id, name, type, base_url, config, enabled, created_at, updated_at
        `,
        values
    );
    if (!res.rows.length) return null;
    return res.rows[0] as MediaService;
}

export async function deleteMediaService(id: number) {
    const pool = getPool();
    await pool.query(`DELETE FROM media_service WHERE id = $1`, [id]);
}
