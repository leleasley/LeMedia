import { prisma } from '../utils/prisma.js';
import { decryptSecretValue, encryptSecretValue } from '../utils/secrets.js';
import { getProviderConfig } from '../providers/authSettings.js';
import { logEvent } from '../utils/logEvent.js';

/**
 * LeMedia's own GitHub connection (not sign-in): an admin connects once, and LeMedia uses the
 * token to read release feeds — today the Zurg and rex nightlies, which live in private repos.
 * Read-only use: two `GET /releases` calls an hour at most. The token is encrypted at rest.
 *
 * GitHub's OAuth scopes have no "read releases of these repos" option; reaching a private repo
 * needs `repo`. A fine-grained personal access token pasted instead can be narrower.
 */

const ID = 'github';
const API = 'https://api.github.com';
const RELEASE_TTL_MS = 60 * 60_000;

export type ReleaseKind = 'zurg' | 'rex' | 'app';
export const DEFAULT_REPOS: Record<ReleaseKind, string> = { zurg: 'debridmediamanager/zurg', rex: 'debridmediamanager/rex', app: 'leleasley/LeMedia' };

interface StoredConfig {
  token?: string;              // encrypted
  login?: string;
  avatar?: string | null;
  scopes?: string;
  source?: 'oauth' | 'token';
  connectedAt?: string;
  connectedBy?: string;
  repos?: Partial<Record<ReleaseKind, string>>;
}

async function readConfig(): Promise<StoredConfig> {
  const row = await prisma.integration.findUnique({ where: { id: ID } });
  try { return row ? JSON.parse(row.config) as StoredConfig : {}; } catch { return {}; }
}

async function writeConfig(cfg: StoredConfig) {
  const config = JSON.stringify(cfg);
  await prisma.integration.upsert({ where: { id: ID }, update: { config }, create: { id: ID, config } });
  releaseCache.clear();
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'LeMedia',
  'X-GitHub-Api-Version': '2022-11-28',
});

/** Whether the GitHub sign-in app is set up — then "Connect with GitHub" can use it. */
export async function oauthAvailable(): Promise<boolean> {
  const cfg = await getProviderConfig('github').catch(() => ({})) as { clientId?: string; clientSecret?: string };
  return !!(cfg.clientId && cfg.clientSecret);
}

export async function githubStatus() {
  const cfg = await readConfig();
  return {
    connected: !!cfg.token,
    login: cfg.login ?? null,
    avatar: cfg.avatar ?? null,
    source: cfg.source ?? null,
    scopes: cfg.scopes ?? null,
    connectedAt: cfg.connectedAt ?? null,
    repos: { ...DEFAULT_REPOS, ...(cfg.repos ?? {}) },
    oauthAvailable: await oauthAvailable(),
  };
}

/** Verify a token against GitHub and store it. Throws a readable message when it's no good. */
export async function connectGithub(token: string, source: 'oauth' | 'token', by: string) {
  const res = await fetch(`${API}/user`, { headers: headers(token), signal: AbortSignal.timeout(10_000) });
  if (res.status === 401) throw new Error('GitHub rejected that token');
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const user = await res.json() as { login: string; avatar_url?: string };
  const prev = await readConfig();
  await writeConfig({
    ...prev,
    token: encryptSecretValue(token) ?? undefined,
    login: user.login,
    avatar: user.avatar_url ?? null,
    scopes: res.headers.get('x-oauth-scopes') ?? (source === 'token' ? 'fine-grained' : ''),
    source,
    connectedAt: new Date().toISOString(),
    connectedBy: by,
  });
  logEvent('info', 'GitHub', `GitHub connected as ${user.login} (${source}) by ${by}`);
  return user.login;
}

/** Forget the token; for an OAuth grant also ask GitHub to revoke it (best effort). */
export async function disconnectGithub(by: string) {
  const cfg = await readConfig();
  const token = decryptSecretValue(cfg.token);
  if (token && cfg.source === 'oauth') {
    const app = await getProviderConfig('github').catch(() => ({})) as { clientId?: string; clientSecret?: string };
    if (app.clientId && app.clientSecret) {
      await fetch(`${API}/applications/${app.clientId}/grant`, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`, Accept: 'application/vnd.github+json', 'User-Agent': 'LeMedia', 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
    }
  }
  await writeConfig({ repos: cfg.repos });
  logEvent('info', 'GitHub', `GitHub disconnected by ${by}`);
}

export async function setReleaseRepos(repos: Partial<Record<ReleaseKind, string>>) {
  const cfg = await readConfig();
  await writeConfig({ ...cfg, repos: { ...(cfg.repos ?? {}), ...repos } });
}

// ── Release feeds ─────────────────────────────────────────────────────────────────────────

interface Release { tag: string; name: string | null; publishedAt: string | null; url: string; prerelease: boolean; body: string | null }
/** Release notes are shown as plain text blocks; a runaway body is cut rather than cached whole. */
const MAX_BODY = 20_000;
const releaseCache = new Map<string, { at: number; releases: Release[] | null; error: string | null }>();

async function fetchReleases(repo: string, token: string, fresh: boolean) {
  const hit = releaseCache.get(repo);
  if (!fresh && hit && Date.now() - hit.at < RELEASE_TTL_MS) return hit;
  let entry: { at: number; releases: Release[] | null; error: string | null };
  try {
    const res = await fetch(`${API}/repos/${repo}/releases?per_page=30`, { headers: headers(token), signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) entry = { at: Date.now(), releases: null, error: 'not_visible' };
    else if (res.status === 401) entry = { at: Date.now(), releases: null, error: 'token_rejected' };
    else if (!res.ok) entry = { at: Date.now(), releases: null, error: `github_${res.status}` };
    else {
      const list = await res.json() as { tag_name: string; name?: string | null; published_at?: string | null; html_url: string; draft?: boolean; prerelease?: boolean; body?: string | null }[];
      entry = {
        at: Date.now(),
        error: null,
        releases: list.filter((r) => !r.draft).map((r) => ({ tag: r.tag_name, name: r.name ?? null, publishedAt: r.published_at ?? null, url: r.html_url, prerelease: !!r.prerelease, body: r.body ? r.body.slice(0, MAX_BODY) : null })),
      };
    }
  } catch (err) {
    entry = { at: Date.now(), releases: null, error: `unreachable: ${String(err).slice(0, 80)}` };
  }
  releaseCache.set(repo, entry);
  return entry;
}

export interface UpdateStatus {
  kind: ReleaseKind;
  repo: string;
  connected: boolean;
  installed: string | null;
  latest: Release | null;
  behind: number | null;        // releases newer than the installed one (null = installed not in the list)
  upToDate: boolean | null;
  error: string | null;
  checkedAt: string | null;
}

/** The repo's recent releases with their notes, newest first, for the changelog dialog. */
export async function releaseNotes(kind: ReleaseKind, installed: string | null, limit = 20) {
  const cfg = await readConfig();
  const repo = cfg.repos?.[kind] || DEFAULT_REPOS[kind];
  const token = decryptSecretValue(cfg.token);
  if (!token) return { kind, repo, connected: false, installed, error: null, releases: [] as Release[] };
  const feed = await fetchReleases(repo, token, false);
  return { kind, repo, connected: true, installed, error: feed.error, releases: (feed.releases ?? []).slice(0, limit) };
}

/** Compare what's running with the newest release in the repo. */
export async function updateStatus(kind: ReleaseKind, installed: string | null, fresh = false): Promise<UpdateStatus> {
  const cfg = await readConfig();
  const repo = cfg.repos?.[kind] || DEFAULT_REPOS[kind];
  const token = decryptSecretValue(cfg.token);
  const base: UpdateStatus = { kind, repo, connected: !!token, installed, latest: null, behind: null, upToDate: null, error: null, checkedAt: null };
  if (!token) return base;
  const feed = await fetchReleases(repo, token, fresh);
  const releases = feed.releases ?? [];
  const latest = releases[0] ?? null;
  const idx = installed ? releases.findIndex((r) => r.tag === installed) : -1;
  return {
    ...base,
    // The notes are served by releaseNotes(); the status poll stays small.
    latest: latest ? { ...latest, body: null } : null,
    error: feed.error,
    checkedAt: new Date(feed.at).toISOString(),
    behind: idx >= 0 ? idx : null,
    upToDate: latest && installed ? latest.tag === installed : null,
  };
}
