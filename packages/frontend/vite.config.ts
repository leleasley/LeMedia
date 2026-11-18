import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Icons are rendered from brand/lemedia-logo.svg (brand/render-icons.py). The -v2 names are new
      // on purpose: installed apps and caches then can't keep serving an older image.
      includeAssets: ['favicon.svg', 'logo-v2.png', 'favicon-v2-16.png', 'favicon-v2-32.png', 'apple-touch-icon-v2.png', 'icon-v2-192.png', 'icon-v2-512.png', 'icon-v2-512-maskable.png'],
      manifest: {
        name: 'LeMedia',
        short_name: 'LeMedia',
        description:
          'LeMedia is a requester app for you, your friends and family — backed by your own media setup.',
        theme_color: '#0b0b0f',
        background_color: '#0b0b0f',
        display: 'standalone',
        // 'any' keeps tablets/desktops installable in landscape (portrait-primary blocked them).
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['entertainment'],
        icons: [
          {
            src: '/icon-v2-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-v2-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-v2-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        importScripts: ['/sw-push.js'],
        // No 'html' in the glob on purpose: index.html is deliberately NOT precached.
        // Precaching it makes the service worker the source of truth for the app shell, so a
        // newly deployed build stays invisible until the SW itself updates — on iOS that can
        // take days, because the PWA sits resident and the in-app "new version" prompt cannot
        // help anyone whose bundle predates it. Serving the HTML network-first means the app
        // always boots the current build, and still works offline from the runtime cache.
        globPatterns: ['**/*.{js,css,svg,png,woff2}'],
        navigateFallback: '',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // The app shell: network-first, with the last good copy kept for offline.
            // /api/ is excluded — the OAuth round-trip (a top-level navigation to
            // /api/auth/:provider/authorize) must never be answered from a cache.
            // Page loads on LeMedia's own origin only. The old regex matched any host, so
            // third-party images (e.g. artworks.thetvdb.com posters) were routed through this
            // network-first rule and failed with "no-response" whenever they took over 3 s.
            urlPattern: ({ url, sameOrigin, request }) =>
              sameOrigin && request.mode === 'navigate' && !/^\/(api|assets)\//.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        ws: true,
        // Forward x-forwarded-* so the backend can resolve LeMedia's public URL correctly
        // (e.g. OAuth callback URL must point at :5173 where the browser actually is, not
        // at the proxy target :3456).
        xfwd: true,
      },
    },
  },
});
