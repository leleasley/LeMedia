import { logEvent } from './logEvent.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Turnstile is active only when both env keys are present. Missing/blank = feature off,
 *  matching the rest of LeMedia's optional-integration pattern. */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

/** Verify a Turnstile token against Cloudflare siteverify. Returns true when the feature
 *  is disabled (fail-open by design so a missing key never locks anyone out) or when the
 *  token validates. Remote IP is forwarded when available per Cloudflare's recommendation. */
export async function verifyTurnstileToken(token: unknown, ip?: string): Promise<boolean> {
  if (!isTurnstileEnabled()) return true;
  if (typeof token !== 'string' || token.length === 0) return false;

  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
  });
  if (ip) body.set('remoteip', ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      logEvent('warn', 'Auth', `Turnstile verification failed: ${data['error-codes']?.join(',') ?? 'unknown'}`);
      return false;
    }
    return true;
  } catch (err) {
    // Network failure talking to Cloudflare — reject rather than let the request through.
    logEvent('error', 'Auth', `Turnstile siteverify request failed: ${(err as Error).message}`);
    return false;
  }
}
