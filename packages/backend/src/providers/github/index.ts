import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthHelpers, AuthProvider, Provider } from '../types.js';
import { getProviderConfig, isProviderEnabled } from '../authSettings.js';
import { resolveOAuthCallbackUrl } from '../../utils/publicUrl.js';
import { withRetry } from '../../utils/fetchWithRetry.js';
import { setAuthCookie } from '../../utils/authCookie.js';
import { verifyTurnstileToken } from '../../utils/turnstile.js';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';
const SCOPE = 'read:user user:email';

interface GithubConfig { clientId?: string; clientSecret?: string; }
interface ConfigResolved { clientId: string; clientSecret: string; }

const STATE_TTL_MS = 10 * 60 * 1000;
const store = new Map<string, { intent: 'login' | 'link' | 'connect'; userId?: number; by?: string; createdAt: number }>();
function gc() { const now = Date.now(); for (const [k, v] of store) if (now - v.createdAt > STATE_TTL_MS) store.delete(k); }

async function getConfig(): Promise<ConfigResolved> {
  const cfg = (await getProviderConfig('github')) as GithubConfig;
  if (!cfg.clientId || !cfg.clientSecret) throw new Error('GitHub OAuth is not fully configured');
  return { clientId: cfg.clientId, clientSecret: cfg.clientSecret };
}

const githubAuth: AuthProvider = {
  config: {
    id: 'github',
    label: 'GitHub',
    type: 'oauth',
    configSchema: [
      { key: 'clientId', label: 'Client ID', type: 'string', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      { key: 'allowSignup', label: 'Allow new account creation', type: 'boolean', default: false, help: 'Auto-create LeMedia users for new GitHub logins.' },
    ],
  },
  async registerRoutes(app: FastifyInstance, helpers: AuthHelpers) {
    app.get<{ Querystring: { action?: string; ts?: string } }>('/github/authorize', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
      if (!(await isProviderEnabled('github'))) return reply.redirect('/login?error=PROVIDER_DISABLED');
      gc();
      const cfg = await getConfig().catch(() => null);
      if (!cfg) return reply.status(503).send({ error: 'GitHub OAuth not configured' });
      const action = request.query.action === 'link' ? 'link' : 'login';
      // Sign-in must pass the login page's Cloudflare check first (linking is already signed in).
      if (action === 'login' && !(await verifyTurnstileToken(request.query.ts, request.ip))) return reply.redirect('/login?error=CAPTCHA_FAILED');
      let userId: number | undefined;
      if (action === 'link') { try { await request.jwtVerify(); } catch { return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`); } userId = request.user.id; }
      const state = randomUUID();
      store.set(state, { intent: action, userId, createdAt: Date.now() });
      const redirectUri = resolveOAuthCallbackUrl(request, 'github');
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', cfg.clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', SCOPE);
      url.searchParams.set('state', state);
      return reply.redirect(url.toString());
    });

    // Admin "Connect GitHub" for release feeds (Zurg/rex updates). Separate from sign-in: it works
    // with GitHub sign-in switched off, asks for `repo` (needed to read private repos' releases)
    // and reuses the registered callback with a 'connect' state. Admin-only via RBAC.
    app.get('/github/connect', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      gc();
      const cfg = await getConfig().catch(() => null);
      if (!cfg) return reply.redirect('/admin?tab=instance&github=not_configured');
      const state = randomUUID();
      store.set(state, { intent: 'connect', userId: request.user?.id, by: request.user?.email, createdAt: Date.now() });
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', cfg.clientId);
      url.searchParams.set('redirect_uri', resolveOAuthCallbackUrl(request, 'github'));
      url.searchParams.set('scope', 'repo read:user');
      url.searchParams.set('state', state);
      return reply.redirect(url.toString());
    });

    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/github/callback', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
      const { code, state, error } = request.query;
      const pending = state ? store.get(state) : undefined;
      const connecting = pending?.intent === 'connect';
      // The admin connect flow doesn't need GitHub sign-in to be switched on.
      if (!connecting && !(await isProviderEnabled('github'))) return reply.redirect('/login?error=PROVIDER_DISABLED');
      if (error) return reply.redirect(connecting ? '/admin?tab=instance&github=denied' : '/login?error=GITHUB_ERROR');
      if (!code || !state) return reply.redirect('/login?error=GITHUB_ERROR');
      const record = store.get(state);
      if (!record) return reply.redirect('/login?error=GITHUB_ERROR');
      store.delete(state);
      const cfg = await getConfig().catch(() => null);
      if (!cfg) return reply.status(503).send({ error: 'GitHub OAuth not configured' });
      const redirectUri = resolveOAuthCallbackUrl(request, 'github');
      const tokenRes = await withRetry(async () => {
        const r = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: redirectUri }),
          signal: AbortSignal.timeout(10000),
        });
        if (r.status >= 500) throw Object.assign(new Error(`GitHub token ${r.status}`), { response: { status: r.status } });
        return r;
      }, { label: 'GitHubToken' });
      if (!tokenRes.ok) return reply.redirect('/login?error=GITHUB_ERROR');
      const tok = (await tokenRes.json()) as { access_token?: string };
      if (!tok.access_token) return reply.redirect(connecting ? '/admin?tab=instance&github=failed' : '/login?error=GITHUB_ERROR');

      if (record.intent === 'connect') {
        const { connectGithub } = await import('../../services/githubIntegration.js');
        try {
          await connectGithub(tok.access_token, 'oauth', record.by ?? 'admin');
          return reply.redirect('/admin?tab=instance&github=connected');
        } catch {
          return reply.redirect('/admin?tab=instance&github=failed');
        }
      }

      const userRes = await withRetry(async () => {
        const r = await fetch(USER_URL, { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'LeMedia' }, signal: AbortSignal.timeout(10000) });
        if (r.status >= 500) throw Object.assign(new Error(`GitHub user ${r.status}`), { response: { status: r.status } });
        return r;
      }, { label: 'GitHubUser' });
      if (!userRes.ok) return reply.redirect('/login?error=GITHUB_ERROR');
      const profile = (await userRes.json()) as { id: number; login: string; name?: string | null; avatar_url?: string | null; email?: string | null };
      let email = profile.email;
      if (!email) {
        const emailsRes = await fetch(EMAILS_URL, { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'LeMedia' }, signal: AbortSignal.timeout(10000) });
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as Array<{ email: string; primary?: boolean; verified?: boolean }>;
          email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? emails[0]?.email ?? null;
        }
      }
      const finalEmail = email || `${profile.id}@github.local`;
      const displayName = profile.name || profile.login;

      if (record.intent === 'link' && record.userId) {
        const { prisma } = await import('../../utils/prisma.js');
        await prisma.userProvider.upsert({
          where: { provider_providerId: { provider: 'github', providerId: String(profile.id) } },
          update: { userId: record.userId, providerUsername: profile.login, providerEmail: finalEmail, providerAvatar: profile.avatar_url ?? null },
          create: { userId: record.userId, provider: 'github', providerId: String(profile.id), providerUsername: profile.login, providerEmail: finalEmail, providerAvatar: profile.avatar_url ?? null },
        });
        const { refreshUserAvatar } = await import('../../utils/avatarSource.js');
        await refreshUserAvatar(record.userId);
        return reply.redirect('/?linked=github');
      }

      let resolved;
      try {
        resolved = await helpers.findOrCreateUser({ provider: 'github', providerId: String(profile.id), providerUsername: profile.login, providerEmail: finalEmail, email: finalEmail, displayName, avatar: profile.avatar_url ?? null });
      } catch (err) {
        if ((err as Error).message === 'SIGNUP_NOT_ALLOWED') return reply.redirect('/login?error=SIGNUP_NOT_ALLOWED');
        throw err;
      }
      return setAuthCookie(reply, app, resolved).redirect('/');
    });
  },
};

export const githubProvider: Provider = { auth: githubAuth };
