import type { FastifyInstance } from 'fastify';
import { readFileSync, statfsSync } from 'node:fs';
import crypto from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import { getAppSettings, parseInstanceLanguages } from '../utils/appSettings.js';
import { pluginEngine } from '../plugins/engine.js';
import { getArrClient } from '../providers/index.js';
import { getServiceConfig } from '../utils/services.js';
import { isQualityAllowedForRole } from '../utils/qualityAccess.js';
import { PROJECT_PACKAGE_JSON } from '../utils/paths.js';
import { getHomepageLayout } from './admin/homepage.js';
import { isResetEnabled } from '../services/passwordReset.js';

const APP_VERSION = JSON.parse(
  readFileSync(PROJECT_PACKAGE_JSON, 'utf-8')
).version as string;

const AVATAR_HOSTS = ['googleusercontent.com', 'githubusercontent.com', 'discordapp.com', 'discordapp.net', 'plex.tv'];
const AVATAR_TTL_MS = 6 * 3600_000;
const avatarCache = new Map<string, { at: number; type: string; body: Buffer }>();

export async function appRoutes(app: FastifyInstance) {
  app.get('/version', async (request, reply) => {
    const clientV = request.cookies?.lemedia_v;
    if (clientV && clientV !== APP_VERSION) {
      reply.header('Clear-Site-Data', '"cache"');
    }
    reply.setCookie('lemedia_v', APP_VERSION, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
    // Report the local version; the cookie above drives cache busting after a rebuild.
    const result: { current: string; latest?: string; updateAvailable?: boolean; releaseUrl?: string } = {
      current: APP_VERSION,
    };
    return result;
  });

  // Provider profile photos (Google, GitHub, Discord, Plex) served from LeMedia's own origin.
  // Browsers often refuse hotlinked Google photos, which left empty avatar circles; the server
  // fetches them fine. Allowlisted hosts only (no open proxy), small images, cached 6 h.
  app.get('/avatar', async (request, reply) => {
    const { u } = request.query as { u?: string };
    let url: URL;
    try { url = new URL(String(u ?? '')); } catch { return reply.status(400).send({ error: 'BAD_URL' }); }
    if (url.protocol !== 'https:' || !AVATAR_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
      return reply.status(400).send({ error: 'HOST_NOT_ALLOWED' });
    }
    const key = url.toString();
    let hit = avatarCache.get(key);
    if (!hit || Date.now() - hit.at > AVATAR_TTL_MS) {
      try {
        const res = await fetch(key, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
        const type = res.headers.get('content-type') ?? '';
        const body = Buffer.from(await res.arrayBuffer());
        if (!res.ok || !type.startsWith('image/') || body.length > 1_000_000) return reply.status(404).send({ error: 'NO_AVATAR' });
        hit = { at: Date.now(), type, body };
        if (avatarCache.size >= 200) avatarCache.delete(avatarCache.keys().next().value as string);
        avatarCache.set(key, hit);
      } catch {
        return reply.status(502).send({ error: 'AVATAR_FETCH_FAILED' });
      }
    }
    reply.header('Content-Type', hit.type);
    reply.header('Cache-Control', 'private, max-age=21600');
    return reply.send(hit.body);
  });

  // Get incident banner (no auth — displayed before login)
  app.get('/banner', async () => {
    const settings = await getAppSettings();
    return { banner: settings?.incidentBanner || null };
  });

  // Quality options available for requests (only those with at least one mapping)
  app.get('/quality-options', async (request) => {
    const user = request.user;
    const options = await prisma.qualityOption.findMany({
      where: { mappings: { some: {} } },
      orderBy: { position: 'asc' },
    });
    if (!user || user.role === 'admin') return options;
    return options.filter(opt => isQualityAllowedForRole(opt.allowedRoles, user.role));
  });

  // ─── Health check (authenticated via API key) ─────────────────────
  app.get('/health', async (request, reply) => {
    const apiKey = (request.headers['x-api-key'] as string)
      || (request.headers.authorization?.replace(/^Bearer\s+/i, ''));

    if (!apiKey) {
      return reply.status(401).send({ error: 'API key required (X-Api-Key header or Authorization: Bearer)' });
    }

    const settings = await getAppSettings();
    if (!settings?.apiKey) {
      return reply.status(403).send({ error: 'Invalid API key' });
    }
    const provided = Buffer.from(apiKey);
    const stored = Buffer.from(settings.apiKey);
    if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) {
      return reply.status(403).send({ error: 'Invalid API key' });
    }

    const uptime = process.uptime();
    const services: Record<string, { online: boolean; version?: string }> = {};

    // Check each configured arr service
    for (const type of ['radarr', 'sonarr']) {
      const config = await getServiceConfig(type);
      if (!config) continue;
      try {
        const client = await getArrClient(type);
        const status = await client.getSystemStatus();
        services[type] = { online: true, version: status.version };
      } catch {
        services[type] = { online: false };
      }
    }

    // Real DB probe (was a hardcoded 'ok'). A locked/corrupt SQLite file must flip health.
    let database: string = 'ok';
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      database = 'error';
    }

    // Disk space for /data (SQLite + backups live here). Best-effort — never fail health on it.
    let storage: { freeMb?: number; totalMb?: number } | undefined;
    try {
      const stats = statfsSync('/data');
      storage = {
        freeMb: Math.floor((stats.bfree * stats.bsize) / 1024 / 1024),
        totalMb: Math.floor((stats.blocks * stats.bsize) / 1024 / 1024),
      };
    } catch {
      /* /data may not exist in dev — omit field */
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptime: Math.floor(uptime),
      database,
      ...(storage ? { storage } : {}),
      memory: { rssMb: Math.floor(process.memoryUsage().rss / 1024 / 1024) },
      services,
    };
  });

  // Get feature flags (no auth — needed by Layout before auth check).
  // `instanceLanguage` drives the frontend UI locale in prod: the user-facing language switcher
  // is dev-only (see UserCluster), so the instance-wide setting is what everyone actually sees.
  app.get('/features', async () => {
    const settings = await getAppSettings();
    const pluginFeatures = pluginEngine.getAllFeatureFlags();
    const languages = parseInstanceLanguages(settings?.instanceLanguages);
    // Custom links (#167) shipped with the features payload so the Layout topbar has them at
    // mount without a second round-trip. Bad JSON falls back to an empty list — admins fix it
    // via the editor without breaking the page.
    let customLinks: Array<{ id: string; label: string; url: string; icon: string; position: 'left' | 'right'; order: number }> = [];
    try {
      const parsed = settings?.customLinks ? JSON.parse(settings.customLinks) : [];
      if (Array.isArray(parsed)) customLinks = parsed;
    } catch { /* malformed JSON in DB → empty list */ }
    // Resolved server-side rather than exposed as a raw setting: the login page may only offer the
    // link when the flag, the email provider AND a working mail transport all line up.
    const passwordResetEnabled = await isResetEnabled();
    return {
      requestsEnabled: settings?.requestsEnabled ?? true,
      calendarEnabled: settings?.calendarEnabled ?? true,
      siteName: settings?.siteName ?? 'LeMedia',
      nsfwBlurEnabled: settings?.nsfwBlurEnabled ?? true,
      passwordResetEnabled,
      // Public Turnstile site key (safe to expose — it's the public half). Null when
      // TURNSTILE_* env keys aren't configured, and the login page then skips the widget.
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
      // Presentation of the IMPORTED state. The vocabulary stays closed; only these two are the
      // admin's, and the colour was validated against COLOR_TOKENS on write.
      importedStateLabel: settings?.importedStateLabel ?? null,
      importedStateColor: settings?.importedStateColor ?? null,
      instanceLanguage: languages[0] ?? 'en',
      customLinks,
      ...pluginFeatures,
    };
  });

  // Get homepage layout (public — needed before auth)
  app.get('/homepage-layout', async () => {
    return getHomepageLayout();
  });

  // Get VAPID public key for push notifications (public — needed before subscription)
  app.get('/vapid-key', async () => {
    return { key: process.env.VAPID_PUBLIC_KEY || null };
  });
}
