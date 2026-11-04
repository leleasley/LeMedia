import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthHelpers, AuthProvider, Provider } from '../types.js';
import { getProviderConfig, isProviderEnabled } from '../authSettings.js';
import { resolveOAuthCallbackUrl } from '../../utils/publicUrl.js';
import { withRetry } from '../../utils/fetchWithRetry.js';
import { setAuthCookie } from '../../utils/authCookie.js';
import { verifyTurnstileToken } from '../../utils/turnstile.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USER_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const SCOPE = 'openid email profile';

interface GoogleConfig {
  clientId?: string;
  clientSecret?: string;
}

interface ConfigResolved {
  clientId: string;
  clientSecret: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const stateStore = new Map<string, { intent: 'login' | 'link'; userId?: number; createdAt: number }>();
function gc() {
  const now = Date.now();
  for (const [k, v] of stateStore) if (now - v.createdAt > STATE_TTL_MS) stateStore.delete(k);
}

async function getConfig(): Promise<ConfigResolved> {
  const cfg = (await getProviderConfig('google')) as GoogleConfig;
  if (!cfg.clientId || !cfg.clientSecret) throw new Error('Google OAuth is not fully configured');
  return { clientId: cfg.clientId, clientSecret: cfg.clientSecret };
}

const googleAuth: AuthProvider = {
  config: {
    id: 'google',
    label: 'Google',
    type: 'oauth',
    configSchema: [
      { key: 'clientId', label: 'Client ID', type: 'string', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      { key: 'allowSignup', label: 'Allow new account creation', type: 'boolean', default: false, help: 'Auto-create LeMedia users for new Google logins.' },
    ],
  },

  async registerRoutes(app: FastifyInstance, helpers: AuthHelpers) {
    app.get<{ Querystring: { action?: string; ts?: string } }>('/google/authorize', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
      if (!(await isProviderEnabled('google'))) return reply.redirect('/login?error=PROVIDER_DISABLED');
      gc();
      const cfg = await getConfig().catch(() => null);
      if (!cfg) return reply.status(503).send({ error: 'Google OAuth not configured' });
      const action = request.query.action === 'link' ? 'link' : 'login';
      // Sign-in must pass the login page's Cloudflare check first (linking is already signed in).
      if (action === 'login' && !(await verifyTurnstileToken(request.query.ts, request.ip))) return reply.redirect('/login?error=CAPTCHA_FAILED');
      let userId: number | undefined;
      if (action === 'link') {
        try { await request.jwtVerify(); } catch { return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`); }
        userId = request.user.id;
      }
      const state = randomUUID();
      stateStore.set(state, { intent: action, userId, createdAt: Date.now() });
      const redirectUri = resolveOAuthCallbackUrl(request, 'google');
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', cfg.clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', SCOPE);
      url.searchParams.set('state', state);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      return reply.redirect(url.toString());
    });

    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/google/callback', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
      if (!(await isProviderEnabled('google'))) return reply.redirect('/login?error=PROVIDER_DISABLED');
      const { code, state, error } = request.query;
      if (error) return reply.redirect(`/login?error=${error === 'access_denied' ? 'access_denied' : 'GOOGLE_ERROR'}`);
      if (!code || !state) return reply.redirect('/login?error=GOOGLE_ERROR');
      const record = stateStore.get(state);
      if (!record) return reply.redirect('/login?error=GOOGLE_ERROR');
      stateStore.delete(state);
      const cfg = await getConfig().catch(() => null);
      if (!cfg) return reply.status(503).send({ error: 'Google OAuth not configured' });
      const redirectUri = resolveOAuthCallbackUrl(request, 'google');
      const tokenRes = await withRetry(async () => {
        const r = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
          signal: AbortSignal.timeout(10000),
        });
        if (r.status >= 500) throw Object.assign(new Error(`Google token ${r.status}`), { response: { status: r.status } });
        return r;
      }, { label: 'GoogleToken' });
      if (!tokenRes.ok) return reply.redirect('/login?error=GOOGLE_ERROR');
      const tok = (await tokenRes.json()) as { access_token?: string };
      if (!tok.access_token) return reply.redirect('/login?error=GOOGLE_ERROR');
      const userRes = await withRetry(async () => {
        const r = await fetch(USER_URL, { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(10000) });
        if (r.status >= 500) throw Object.assign(new Error(`Google user ${r.status}`), { response: { status: r.status } });
        return r;
      }, { label: 'GoogleUser' });
      if (!userRes.ok) return reply.redirect('/login?error=GOOGLE_ERROR');
      const profile = (await userRes.json()) as { id: string; email?: string; name?: string; picture?: string; verified_email?: boolean };
      if (!profile.id) return reply.redirect('/login?error=GOOGLE_ERROR');
      const email = profile.email || `${profile.id}@google.local`;
      const displayName = profile.name || email;

      if (record.intent === 'link' && record.userId) {
        const { prisma } = await import('../../utils/prisma.js');
        await prisma.userProvider.upsert({
          where: { provider_providerId: { provider: 'google', providerId: profile.id } },
          update: { userId: record.userId, providerUsername: displayName, providerEmail: email, providerAvatar: profile.picture ?? null },
          create: { userId: record.userId, provider: 'google', providerId: profile.id, providerUsername: displayName, providerEmail: email, providerAvatar: profile.picture ?? null },
        });
        const { refreshUserAvatar } = await import('../../utils/avatarSource.js');
        await refreshUserAvatar(record.userId);
        return reply.redirect('/?linked=google');
      }

      let resolved;
      try {
        resolved = await helpers.findOrCreateUser({ provider: 'google', providerId: profile.id, providerUsername: displayName, providerEmail: email, email, displayName, avatar: profile.picture ?? null });
      } catch (err) {
        if ((err as Error).message === 'SIGNUP_NOT_ALLOWED') return reply.redirect('/login?error=SIGNUP_NOT_ALLOWED');
        throw err;
      }
      return setAuthCookie(reply, app, resolved).redirect('/');
    });
  },
};

export const googleProvider: Provider = { auth: googleAuth };
