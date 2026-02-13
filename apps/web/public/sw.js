/// <reference lib="webworker" />

/**
 * LeMedia Service Worker
 *
 * Caching Strategy:
 * - SSE streams (/api/v1/stream/*): Bypassed entirely (EventSource incompatible with SW)
 * - API calls: Bypassed entirely (browser handles HTTP caching/304 natively)
 * - HTML pages: Bypassed entirely (browser handles navigation normally)
 * - Static assets: Cache-first with network fallback
 */

const CACHE_VERSION = 'v10'; // bump to force clients to update SW
const CACHE_NAME = `lemedia-${CACHE_VERSION}`;
const OFFLINE_CACHE = `lemedia-offline-${CACHE_VERSION}`;
const RUNTIME_CACHE = `lemedia-runtime-${CACHE_VERSION}`;

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== OFFLINE_CACHE && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // COMPLETELY BYPASS these - do not call respondWith at all:
  // - Non-GET requests
  // - Cross-origin requests  
  // - API requests (let browser handle 304/caching natively)
  // - SSE streams
  // - HTML pages
  if (
    request.method !== 'GET' ||
    url.origin !== location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    request.headers.get('accept')?.includes('text/html')
  ) {
    return; // Do NOT call respondWith - browser handles request normally
  }

  // Only handle static assets (images, fonts, CSS, JS) for PWA offline support
  if (
    request.url.match(/\.(png|jpg|jpeg|webp|gif|svg|woff2?|ttf|eot|css|js)$/) ||
    url.pathname.startsWith('/imageproxy/') ||
    url.pathname.startsWith('/avatarproxy/')
  ) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }
      const response = await fetch(request);
      if (response.ok) {
        const responseClone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });
      }
      return response;
    })());
    return;
  }

  // Everything else - bypass (no respondWith)
});

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  try {
    const data = event.data.json();
    const title = data.title || 'LeMedia';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'lemedia-notification',
      data: {
        url: data.url || '/',
        ...data.data,
      },
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
      silent: data.silent || false,
      vibrate: data.vibrate || [200, 100, 200],
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('[SW] Push notification error:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none found
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync for offline requests (optional enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-requests') {
    event.waitUntil(syncRequests());
  }
});

async function syncRequests() {
  // Placeholder for syncing offline requests when back online
  console.log('[SW] Syncing offline requests...');
}
