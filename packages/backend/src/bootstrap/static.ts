import { existsSync, readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { FRONTEND_DIST, PROJECT_PACKAGE_JSON } from '../utils/paths.js';

const APP_VERSION = JSON.parse(readFileSync(PROJECT_PACKAGE_JSON, 'utf-8')).version as string;

/**
 * Production-only: serve the built frontend and fall back to `index.html` for unknown non-API
 * routes so the React Router SPA can handle them. No-op in dev — Vite owns the frontend there.
 */
export async function registerStatic(app: FastifyInstance) {
  if (process.env.NODE_ENV !== 'production') return;

  const frontendDir = FRONTEND_DIST;
  // Operators sometimes deploy the backend image without the frontend stage (headless / API-only
  // setup, broken multi-stage Dockerfile, wrong volume mount). A silent no-op here leaves the
  // admin puzzled by a 404 on /. Surface it loudly so the boot log makes the cause obvious.
  if (!existsSync(frontendDir)) {
    app.log.warn({ frontendDir }, 'Frontend bundle not found, serving API only');
    return;
  }

  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: '/',
    wildcard: false,
    // We own Cache-Control below — the plugin's own header would otherwise win for the files
    // that must never be cached (see the onSend hook).
    cacheControl: false,
  });

  // Cloudflare's zone-level "Browser Cache TTL" rewrites a bare/`max-age=0` origin header into a
  // 4-hour TTL for .js — including sw.js. A cached service-worker script means the browser never
  // notices a new deploy, so a fresh bundle stays invisible for hours (worse on iOS, where the
  // PWA sits resident and never re-runs its JS). These files must say "never cache" explicitly so
  // the CDN passes that through. Hashed Vite chunks are content-addressed, so they get immutable.
  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0];
    const name = path.split('/').pop() || '';
    // The SPA root is served via sendFile from the not-found handler, so match it by path.
    if (path === '/' || name === 'sw.js' || name === 'registerSW.js' || name === 'sw-push.js' || name === 'index.html' || name === 'manifest.webmanifest') {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else if (path.startsWith('/assets/')) {
      // Vite output: content-hashed names, so a changed file is a new URL.
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(woff2?|png|svg|ico)$/.test(name)) {
      // Fixed names in public/ (logo, favicons, app icons) can change between builds — never
      // mark them immutable, or browsers and Cloudflare keep the old image for a year.
      reply.header('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
    return payload;
  });

  // "Open in app" hand-off page. Home-screen web apps on iOS won't pass custom schemes
  // (plezy://, plex://, infuse://) to other apps, so the PWA opens this page in a Safari sheet,
  // and Safari does the hand-off. Only these app schemes (and Plex web) are accepted, so it
  // can't be used to send people anywhere else. No sign-in: the sheet doesn't share the PWA's.
  const OPEN_TARGETS: { prefix: string; name: string; store: string | null }[] = [
    { prefix: 'plezy://', name: 'Plezy', store: 'https://apps.apple.com/app/id6754315964' },
    { prefix: 'plex://', name: 'Plex', store: 'https://apps.apple.com/app/id383457673' },
    { prefix: 'infuse://', name: 'Infuse', store: 'https://apps.apple.com/app/id1136220934' },
    { prefix: 'https://app.plex.tv/', name: 'Plex', store: null },
  ];
  const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  app.get('/open', async (request, reply) => {
    const to = String((request.query as { to?: string }).to ?? '');
    const target = OPEN_TARGETS.find((x) => to.startsWith(x.prefix));
    if (!target || to.length > 2000) return reply.status(400).type('text/plain').send('Unsupported link');
    const href = esc(to);
    reply.header('Cache-Control', 'no-store');
    return reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening ${target.name}</title>
<style>body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#0b0b0f;color:#f4f1ec;font-family:-apple-system,system-ui,sans-serif;text-align:center}
main{padding:28px;max-width:340px}img{width:72px;height:72px}h1{font-size:20px;margin:16px 0 6px}p{color:#a3a09a;font-size:14px;line-height:1.5;margin:0 0 20px}
a.btn{display:block;background:#f25f4c;color:#fff;text-decoration:none;font-weight:600;padding:14px;border-radius:14px;font-size:16px}
a.sub{display:inline-block;margin-top:14px;color:#a3a09a;font-size:13px}</style></head>
<body><main><img src="/logo-v2.png" alt=""><h1>Opening ${target.name}…</h1>
<p>If nothing happens, tap the button. iOS may ask whether to open ${target.name}.</p>
<a class="btn" href="${href}">Open ${target.name}</a>
${target.store ? `<a class="sub" href="${target.store}">Don't have ${target.name}? Get it on the App Store</a>` : ''}
</main><script>setTimeout(function(){location.href=${JSON.stringify(to).replace(/</g, '\\u003c')};},150);</script></body></html>`);
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    // File-like URLs (hashed Vite chunks, fonts, icons…) must 404 when missing — falling
    // through to index.html makes the browser parse HTML as JS/CSS ("'text/html' is not a
    // valid JS MIME type") and crashes lazy routes after a deploy rotates chunk hashes.
    // SPA routes never contain a file extension, so this can't misfire on them.
    const lastSegment = request.url.split('?')[0].split('/').pop() || '';
    if (lastSegment.includes('.')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    reply.header('Cache-Control', 'no-store');
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
    return reply.sendFile('index.html');
  });
}
