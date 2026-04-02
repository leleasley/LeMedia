import { z } from "zod";
import cacheManager from "@/lib/cache-manager";
import { getPool, decryptOptionalSecret, encryptOptionalSecret, ensureSchema, ensureUserSchema } from "./core";


const SETTINGS_CACHE_TTL_SECONDS = Math.max(
  5,
  Number(process.env.SETTINGS_CACHE_TTL_SECONDS ?? "30") || 30
);
const settingsCache = cacheManager.getCache("settings", {
  stdTTL: SETTINGS_CACHE_TTL_SECONDS,
  checkperiod: Math.max(10, Math.floor(SETTINGS_CACHE_TTL_SECONDS / 2))
});

function settingCacheKey(key: string) {
  return `setting:${key}`;
}

export async function getSetting(key: string): Promise<string | null> {
  await ensureSchema();
  const cacheKey = settingCacheKey(key);
  const cached = settingsCache.get<string | null>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const p = getPool();
  const res = await p.query(`SELECT value FROM app_setting WHERE key = $1 LIMIT 1`, [key]);
  const value = res.rows.length ? (res.rows[0].value as string) : null;
  settingsCache.set(cacheKey, value, SETTINGS_CACHE_TTL_SECONDS);
  return value;
}


export async function setSetting(key: string, value: string): Promise<void> {
  await ensureSchema();
  const p = getPool();
  await p.query(`INSERT INTO app_setting (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
  settingsCache.del(settingCacheKey(key));
}


export type ThirdPartyAuthProviderKey = "google" | "github" | "telegram";


export type ThirdPartyOauthProviderSettings = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
};


export type ThirdPartyTelegramSettings = ThirdPartyOauthProviderSettings;


export type ThirdPartyAuthSettings = {
  google: ThirdPartyOauthProviderSettings;
  github: ThirdPartyOauthProviderSettings;
  telegram: ThirdPartyTelegramSettings;
};


type ThirdPartyAuthStoredProvider = {
  enabled?: boolean;
  clientId?: string;
  clientSecretEncrypted?: string | null;
};

type ThirdPartyAuthStoredSettings = {
  google?: ThirdPartyAuthStoredProvider;
  github?: ThirdPartyAuthStoredProvider;
  telegram?: ThirdPartyAuthStoredProvider;
};

const ThirdPartyAuthStoredSchema = z.object({
  google: z.object({
    enabled: z.boolean().optional(),
    clientId: z.string().optional(),
    clientSecretEncrypted: z.string().nullable().optional()
  }).optional(),
  github: z.object({
    enabled: z.boolean().optional(),
    clientId: z.string().optional(),
    clientSecretEncrypted: z.string().nullable().optional()
  }).optional(),
  telegram: z.object({
    enabled: z.boolean().optional(),
    clientId: z.string().optional(),
    clientSecretEncrypted: z.string().nullable().optional()
  }).optional()
});

const ThirdPartyAuthDefaults: ThirdPartyAuthSettings = {
  google: {
    enabled: false,
    clientId: "",
    clientSecret: ""
  },
  github: {
    enabled: false,
    clientId: "",
    clientSecret: ""
  },
  telegram: {
    enabled: false,
    clientId: "",
    clientSecret: ""
  }
};

function normalizeThirdPartyOauthProvider(input?: ThirdPartyAuthStoredProvider, envClientId?: string, envClientSecret?: string): ThirdPartyOauthProviderSettings {
  const storedClientId = input?.clientId?.trim() ?? "";
  const storedSecret = decryptOptionalSecret(input?.clientSecretEncrypted) ?? "";
  const clientId = storedClientId || envClientId?.trim() || "";
  const clientSecret = storedSecret || envClientSecret?.trim() || "";
  const hasStoredEnabled = typeof input?.enabled === "boolean";
  const enabled = hasStoredEnabled ? Boolean(input?.enabled) : Boolean(clientId && clientSecret);

  return {
    enabled,
    clientId,
    clientSecret
  };
}

export async function getThirdPartyAuthSettings(): Promise<ThirdPartyAuthSettings> {
  const raw = await getSetting("third_party_auth_settings");
  let parsed: ThirdPartyAuthStoredSettings = {};

  if (raw) {
    try {
      parsed = ThirdPartyAuthStoredSchema.parse(JSON.parse(raw));
    } catch {
      parsed = {};
    }
  }

  const google = normalizeThirdPartyOauthProvider(
    parsed.google,
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  const github = normalizeThirdPartyOauthProvider(
    parsed.github,
    process.env.GITHUB_OAUTH_CLIENT_ID,
    process.env.GITHUB_OAUTH_CLIENT_SECRET
  );
  const telegram = normalizeThirdPartyOauthProvider(
    parsed.telegram,
    process.env.TELEGRAM_OAUTH_CLIENT_ID,
    process.env.TELEGRAM_OAUTH_CLIENT_SECRET
  );

  return {
    google,
    github,
    telegram
  };
}


export async function setThirdPartyAuthSettings(input: ThirdPartyAuthSettings): Promise<void> {
  const payload: ThirdPartyAuthStoredSettings = {
    google: {
      enabled: Boolean(input.google.enabled),
      clientId: input.google.clientId.trim(),
      clientSecretEncrypted: encryptOptionalSecret(input.google.clientSecret)
    },
    github: {
      enabled: Boolean(input.github.enabled),
      clientId: input.github.clientId.trim(),
      clientSecretEncrypted: encryptOptionalSecret(input.github.clientSecret)
    },
    telegram: {
      enabled: Boolean(input.telegram.enabled),
      clientId: input.telegram.clientId.trim(),
      clientSecretEncrypted: encryptOptionalSecret(input.telegram.clientSecret)
    }
  };

  await setSetting("third_party_auth_settings", JSON.stringify(payload));
}


export async function getSettingInt(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  if (!raw) return fallback;
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v) || isNaN(v)) return fallback;
  return v;
}


// ============================================================================
// Setup Wizard Functions
// ============================================================================

/**
 * Get the total number of users in the database
 */
export async function getUserCount(): Promise<number> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(`SELECT COUNT(*)::int AS count FROM app_user`);
  return res.rows[0]?.count ?? 0;
}


/**
 * Check if the initial setup has been completed.
 * Returns true if:
 * - The setup_completed setting is "1" or "true", OR
 * - Users already exist in the database (backwards compatibility for existing installations)
 */
export async function isSetupComplete(): Promise<boolean> {
  // First check the explicit setting
  const value = await getSetting("setup_completed");
  if (value === "1" || value === "true") {
    return true;
  }

  // Fallback: if users already exist, consider setup complete
  // This handles existing installations that didn't go through setup wizard
  const userCount = await getUserCount();
  if (userCount > 0) {
    // Auto-mark as complete for existing installations
    await setSetting("setup_completed", "1");
    return true;
  }

  return false;
}


/**
 * Mark the initial setup as complete
 */
export async function markSetupComplete(): Promise<void> {
  await setSetting("setup_completed", "1");
}


type RequestLimitSettings = {
  limit: number;
  days: number;
};

export type RequestLimitDefaults = {
  movie: RequestLimitSettings;
  series: RequestLimitSettings;
};


export type RequestLimitOverrides = {
  movieLimit: number | null;
  movieDays: number | null;
  seriesLimit: number | null;
  seriesDays: number | null;
};


export type RequestLimitStatus = {
  limit: number;
  days: number;
  used: number;
  remaining: number | null;
  unlimited: boolean;
};


const DEFAULT_REQUEST_LIMIT = 0;
const DEFAULT_REQUEST_DAYS = 7;

function normalizeLimitValue(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function normalizeDaysValue(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export async function getDefaultRequestLimits(): Promise<RequestLimitDefaults> {
  const movieLimitRaw = await getSettingInt("request_limit_movie", DEFAULT_REQUEST_LIMIT);
  const movieDaysRaw = await getSettingInt("request_limit_movie_days", DEFAULT_REQUEST_DAYS);
  const seriesLimitRaw = await getSettingInt("request_limit_series", DEFAULT_REQUEST_LIMIT);
  const seriesDaysRaw = await getSettingInt("request_limit_series_days", DEFAULT_REQUEST_DAYS);

  return {
    movie: {
      limit: normalizeLimitValue(movieLimitRaw, DEFAULT_REQUEST_LIMIT),
      days: normalizeDaysValue(movieDaysRaw, DEFAULT_REQUEST_DAYS)
    },
    series: {
      limit: normalizeLimitValue(seriesLimitRaw, DEFAULT_REQUEST_LIMIT),
      days: normalizeDaysValue(seriesDaysRaw, DEFAULT_REQUEST_DAYS)
    }
  };
}


export async function getUserRequestLimitOverrides(userId: number): Promise<RequestLimitOverrides> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT
      request_limit_movie,
      request_limit_movie_days,
      request_limit_series,
      request_limit_series_days
    FROM app_user
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  if (!res.rows.length) {
    return { movieLimit: null, movieDays: null, seriesLimit: null, seriesDays: null };
  }
  const row = res.rows[0];
  return {
    movieLimit: row.request_limit_movie ?? null,
    movieDays: row.request_limit_movie_days ?? null,
    seriesLimit: row.request_limit_series ?? null,
    seriesDays: row.request_limit_series_days ?? null
  };
}


export async function getEffectiveRequestLimits(userId: number): Promise<RequestLimitDefaults> {
  const defaults = await getDefaultRequestLimits();
  const overrides = await getUserRequestLimitOverrides(userId);

  const movieLimit = overrides.movieLimit ?? defaults.movie.limit;
  const movieDays = overrides.movieDays ?? defaults.movie.days;
  const seriesLimit = overrides.seriesLimit ?? defaults.series.limit;
  const seriesDays = overrides.seriesDays ?? defaults.series.days;

  return {
    movie: {
      limit: normalizeLimitValue(movieLimit, defaults.movie.limit),
      days: normalizeDaysValue(movieDays, defaults.movie.days)
    },
    series: {
      limit: normalizeLimitValue(seriesLimit, defaults.series.limit),
      days: normalizeDaysValue(seriesDays, defaults.series.days)
    }
  };
}


export async function getUserRequestLimitStatus(
  userId: number,
  requestType: "movie" | "episode"
): Promise<RequestLimitStatus> {
  const limits = await getEffectiveRequestLimits(userId);
  const limitConfig = requestType === "movie" ? limits.movie : limits.series;
  const limit = limitConfig.limit;
  const days = limitConfig.days;

  if (limit <= 0) {
    return { limit: 0, days, used: 0, remaining: null, unlimited: true };
  }

  const p = getPool();
  const res = await p.query(
    `
    SELECT COUNT(*)::int AS count
    FROM media_request
    WHERE requested_by = $1
      AND request_type = $2
      AND created_at >= NOW() - ($3::int * INTERVAL '1 day')
    `,
    [userId, requestType, days]
  );
  const used = Number(res.rows[0]?.count ?? 0);
  const remaining = Math.max(limit - used, 0);
  return { limit, days, used, remaining, unlimited: false };
}


export type JellyfinConfig = {
  name: string;
  hostname: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  externalUrl: string;
  jellyfinForgotPasswordUrl: string;
  libraries: Array<{
    id: string;
    name: string;
    type: "movie" | "show";
    enabled: boolean;
    lastScan?: number;
  }>;
  serverId: string;
  apiKeyEncrypted: string;
};


const JellyfinConfigSchema = z.object({
  name: z.string().optional(),
  hostname: z.string().optional(),
  port: z.number().optional(),
  useSsl: z.boolean().optional(),
  urlBase: z.string().optional(),
  externalUrl: z.string().optional(),
  jellyfinForgotPasswordUrl: z.string().optional(),
  libraries: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(["movie", "show"]),
        enabled: z.boolean(),
        lastScan: z.number().optional()
      })
    )
    .optional(),
  serverId: z.string().optional(),
  apiKeyEncrypted: z.string().optional(),
});

const JellyfinConfigDefaults: JellyfinConfig = {
  name: "",
  hostname: "",
  port: 8096,
  useSsl: false,
  urlBase: "",
  externalUrl: "",
  jellyfinForgotPasswordUrl: "",
  libraries: [],
  serverId: "",
  apiKeyEncrypted: "",
};

export async function getJellyfinConfig(): Promise<JellyfinConfig> {
  const raw = await getSetting("jellyfin_config");
  let parsed: Partial<JellyfinConfig> = {};
  if (raw) {
    try {
      parsed = JellyfinConfigSchema.parse(JSON.parse(raw));
    } catch {
      parsed = {};
    }
  }

  return {
    ...JellyfinConfigDefaults,
    ...parsed,
    name: parsed.name ?? JellyfinConfigDefaults.name,
    hostname: parsed.hostname ?? JellyfinConfigDefaults.hostname,
    port: typeof parsed.port === "number" ? parsed.port : JellyfinConfigDefaults.port,
    useSsl: parsed.useSsl ?? JellyfinConfigDefaults.useSsl,
    urlBase: parsed.urlBase ?? JellyfinConfigDefaults.urlBase,
    externalUrl: parsed.externalUrl ?? JellyfinConfigDefaults.externalUrl,
    jellyfinForgotPasswordUrl: parsed.jellyfinForgotPasswordUrl ?? JellyfinConfigDefaults.jellyfinForgotPasswordUrl,
    libraries: parsed.libraries ?? JellyfinConfigDefaults.libraries,
    serverId: parsed.serverId ?? JellyfinConfigDefaults.serverId,
    apiKeyEncrypted: parsed.apiKeyEncrypted ?? JellyfinConfigDefaults.apiKeyEncrypted,
  };
}


export async function setJellyfinConfig(input: JellyfinConfig): Promise<void> {
  await setSetting("jellyfin_config", JSON.stringify(input));
}


export type OidcConfig = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  jwksUrl: string;
  logoutUrl: string;
  scopes: string[];
  usernameClaim: string;
  emailClaim: string;
  groupsClaim: string;
  allowAutoCreate: boolean;
  matchByEmail: boolean;
  matchByUsername: boolean;
  syncGroups: boolean;
};


const OidcConfigSchema = z.object({
  enabled: z.boolean().optional(),
  issuer: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional(),
  authorizationUrl: z.string().optional(),
  tokenUrl: z.string().optional(),
  userinfoUrl: z.string().optional(),
  jwksUrl: z.string().optional(),
  logoutUrl: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  usernameClaim: z.string().optional(),
  emailClaim: z.string().optional(),
  groupsClaim: z.string().optional(),
  allowAutoCreate: z.boolean().optional(),
  matchByEmail: z.boolean().optional(),
  matchByUsername: z.boolean().optional(),
  syncGroups: z.boolean().optional()
});

const OidcConfigDefaults: OidcConfig = {
  enabled: false,
  issuer: "",
  clientId: "",
  clientSecret: "",
  redirectUri: "",
  authorizationUrl: "",
  tokenUrl: "",
  userinfoUrl: "",
  jwksUrl: "",
  logoutUrl: "",
  scopes: ["openid", "profile", "email"],
  usernameClaim: "preferred_username",
  emailClaim: "email",
  groupsClaim: "groups",
  allowAutoCreate: false,
  matchByEmail: true,
  matchByUsername: true,
  syncGroups: false
};

export async function getOidcConfig(): Promise<OidcConfig> {
  const raw = await getSetting("oidc_config");
  let parsed: Partial<OidcConfig> = {};
  if (raw) {
    try {
      parsed = OidcConfigSchema.parse(JSON.parse(raw));
    } catch {
      parsed = {};
    }
  }

  const withEnv: Partial<OidcConfig> = {};
  const envIssuer = process.env.OIDC_ISSUER?.trim();
  const envClientId = process.env.OIDC_CLIENT_ID?.trim();
  const envClientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
  const envRedirectUri = process.env.OIDC_REDIRECT_URI?.trim();
  if (envIssuer) withEnv.issuer = envIssuer;
  if (envClientId) withEnv.clientId = envClientId;
  if (envClientSecret) withEnv.clientSecret = envClientSecret;
  if (envRedirectUri) withEnv.redirectUri = envRedirectUri;

  return {
    ...OidcConfigDefaults,
    ...withEnv,
    ...parsed,
    scopes: Array.isArray(parsed.scopes) && parsed.scopes.length ? parsed.scopes : OidcConfigDefaults.scopes,
    redirectUri: parsed.redirectUri ?? withEnv.redirectUri ?? OidcConfigDefaults.redirectUri
  };
}


export async function setOidcConfig(input: OidcConfig): Promise<void> {
  await setSetting("oidc_config", JSON.stringify(input));
}


export type OidcProviderConfig = {
  id: string;
  name?: string;
  providerType?: "oidc" | "duo_websdk";
  duoApiHostname?: string;
  enabled?: boolean;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  jwksUrl?: string;
  logoutUrl?: string;
  scopes?: string[];
  usernameClaim?: string;
  emailClaim?: string;
  groupsClaim?: string;
  allowAutoCreate?: boolean;
  matchByEmail?: boolean;
  matchByUsername?: boolean;
  syncGroups?: boolean;
};


export type OidcSettings = {
  activeProviderId: string | null;
  providers: OidcProviderConfig[];
};


const OidcProviderDefaults: OidcProviderConfig = {
  id: "default",
  name: "OIDC Provider",
  providerType: "oidc",
  duoApiHostname: "",
  enabled: false,
  issuer: "",
  clientId: "",
  clientSecret: "",
  redirectUri: "",
  authorizationUrl: "",
  tokenUrl: "",
  userinfoUrl: "",
  jwksUrl: "",
  logoutUrl: "",
  scopes: ["openid", "profile", "email"],
  usernameClaim: "preferred_username",
  emailClaim: "email",
  groupsClaim: "groups",
  allowAutoCreate: false,
  matchByEmail: true,
  matchByUsername: true,
  syncGroups: false
};

function normalizeOidcProvider(input: OidcProviderConfig): OidcProviderConfig {
  return {
    ...OidcProviderDefaults,
    ...input,
    id: input.id || OidcProviderDefaults.id,
    name: input.name?.trim() || OidcProviderDefaults.name,
    providerType: input.providerType ?? "oidc",
    duoApiHostname: input.duoApiHostname?.trim() ?? "",
    issuer: input.issuer?.trim() ?? "",
    clientId: input.clientId?.trim() ?? "",
    clientSecret: input.clientSecret ?? "",
    redirectUri: input.redirectUri?.trim() ?? "",
    authorizationUrl: input.authorizationUrl?.trim() ?? "",
    tokenUrl: input.tokenUrl?.trim() ?? "",
    userinfoUrl: input.userinfoUrl?.trim() ?? "",
    jwksUrl: input.jwksUrl?.trim() ?? "",
    logoutUrl: input.logoutUrl?.trim() ?? "",
    scopes: Array.isArray(input.scopes) && input.scopes.length ? input.scopes : OidcProviderDefaults.scopes,
    usernameClaim: input.usernameClaim?.trim() || OidcProviderDefaults.usernameClaim,
    emailClaim: input.emailClaim?.trim() || OidcProviderDefaults.emailClaim,
    groupsClaim: input.groupsClaim?.trim() || OidcProviderDefaults.groupsClaim,
    allowAutoCreate: input.allowAutoCreate ?? OidcProviderDefaults.allowAutoCreate,
    matchByEmail: input.matchByEmail ?? OidcProviderDefaults.matchByEmail,
    matchByUsername: input.matchByUsername ?? OidcProviderDefaults.matchByUsername,
    syncGroups: input.syncGroups ?? OidcProviderDefaults.syncGroups,
    enabled: input.enabled ?? false
  };
}

export async function getOidcSettings(): Promise<OidcSettings> {
  const raw = await getSetting("oidc_settings");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as OidcSettings;
      const providers = Array.isArray(parsed.providers) ? parsed.providers.map(normalizeOidcProvider) : [];
      return {
        activeProviderId: parsed.activeProviderId ?? null,
        providers
      };
    } catch {
      // fall through to legacy
    }
  }

  const legacyRaw = await getSetting("oidc_config");
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw) as Partial<OidcSettings>;
      if (Array.isArray(parsed.providers)) {
        const providers = parsed.providers.map(normalizeOidcProvider);
        const normalized: OidcSettings = {
          activeProviderId: parsed.activeProviderId ?? null,
          providers
        };
        await setSetting("oidc_settings", JSON.stringify(normalized));
        return normalized;
      }
    } catch {
      // fall through to legacy config parser
    }
  }

  const legacy = await getOidcConfig();
  const provider: OidcProviderConfig = {
    ...legacy,
    id: "legacy",
    name: "OIDC Provider",
    providerType: "oidc",
    enabled: legacy.enabled
  };

  return {
    activeProviderId: legacy.enabled ? provider.id : null,
    providers: [normalizeOidcProvider(provider)]
  };
}


export async function setOidcSettings(input: OidcSettings): Promise<void> {
  await setSetting("oidc_settings", JSON.stringify(input));
}


export async function getActiveOidcProvider(): Promise<OidcProviderConfig | null> {
  const settings = await getOidcSettings();
  const candidates = settings.providers ?? [];
  if (!candidates.length) return null;
  const active = settings.activeProviderId
    ? candidates.find((provider) => provider.id === settings.activeProviderId)
    : candidates.find((provider) => provider.enabled);
  return active?.enabled ? normalizeOidcProvider(active) : null;
}


export async function getOidcProviderById(providerId: string): Promise<OidcProviderConfig | null> {
  const settings = await getOidcSettings();
  const found = settings.providers.find((provider) => provider.id === providerId);
  return found ? normalizeOidcProvider(found) : null;
}


export type PlexLibraryConfig = {
  id: string;
  name: string;
  type: "movie" | "show";
  enabled: boolean;
};


export type PlexConfig = {
  enabled: boolean;
  name: string;
  hostname: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  externalUrl: string;
  libraries: PlexLibraryConfig[];
  serverId: string;
  tokenEncrypted: string;
};


const PlexConfigDefaults: PlexConfig = {
  enabled: false,
  name: "",
  hostname: "",
  port: 32400,
  useSsl: false,
  urlBase: "",
  externalUrl: "",
  libraries: [],
  serverId: "",
  tokenEncrypted: ""
};

export async function getPlexConfig(): Promise<PlexConfig> {
  const raw = await getSetting("plex_config");
  let parsed: Partial<PlexConfig> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Partial<PlexConfig>;
    } catch {
      parsed = {};
    }
  }
  return {
    ...PlexConfigDefaults,
    ...parsed,
    libraries: Array.isArray(parsed.libraries) ? parsed.libraries : PlexConfigDefaults.libraries
  };
}


export async function setPlexConfig(input: PlexConfig): Promise<void> {
  await setSetting("plex_config", JSON.stringify(input));
}


export type TraktConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  appAuthorizedAt?: string | null;
};


const TraktConfigSchema = z.object({
  enabled: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional(),
  appAuthorizedAt: z.string().nullable().optional()
});

const TraktConfigDefaults: TraktConfig = {
  enabled: false,
  clientId: "",
  clientSecret: "",
  redirectUri: "",
  appAuthorizedAt: null
};

function parseEnvBoolean(value?: string | null): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

export async function getTraktConfig(): Promise<TraktConfig> {
  const raw = await getSetting("trakt_config");
  let parsed: Partial<TraktConfig> = {};
  if (raw) {
    try {
      parsed = TraktConfigSchema.parse(JSON.parse(raw));
    } catch {
      parsed = {};
    }
  }

  const withEnv: Partial<TraktConfig> = {};
  const envEnabled = parseEnvBoolean(process.env.TRAKT_ENABLED);
  const envClientId = process.env.TRAKT_CLIENT_ID?.trim();
  const envClientSecret = process.env.TRAKT_CLIENT_SECRET?.trim();
  const envRedirectUri = process.env.TRAKT_REDIRECT_URI?.trim();
  if (envEnabled !== undefined) withEnv.enabled = envEnabled;
  if (envClientId) withEnv.clientId = envClientId;
  if (envClientSecret) withEnv.clientSecret = envClientSecret;
  if (envRedirectUri) withEnv.redirectUri = envRedirectUri;

  return {
    ...TraktConfigDefaults,
    ...withEnv,
    ...parsed,
    clientId: parsed.clientId ?? withEnv.clientId ?? TraktConfigDefaults.clientId,
    clientSecret: parsed.clientSecret ?? withEnv.clientSecret ?? TraktConfigDefaults.clientSecret,
    redirectUri: parsed.redirectUri ?? withEnv.redirectUri ?? TraktConfigDefaults.redirectUri,
    enabled: parsed.enabled ?? withEnv.enabled ?? TraktConfigDefaults.enabled
  };
}


export async function setTraktConfig(input: TraktConfig): Promise<void> {
  await setSetting("trakt_config", JSON.stringify(input));
}
