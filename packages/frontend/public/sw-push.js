// Push notification handler for the LeMedia PWA
// This file is injected into the service worker by vite-plugin-pwa (workbox.importScripts).

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'LeMedia', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'LeMedia', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: '/favicon-32.png',
      data: { url: data.url || '/' },
      tag: data.url || 'lemedia-notification', // collapses repeats for the same page
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || '/';
  const absoluteUrl = rawUrl.startsWith('http') ? rawUrl : self.location.origin + rawUrl;
  const path = absoluteUrl.startsWith(self.location.origin)
    ? absoluteUrl.slice(self.location.origin.length) || '/'
    : null;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      const client = windowClients.find((c) => c.url.startsWith(self.location.origin));
      if (client && path) {
        // App already open (foreground or background): focus it and let the SPA router
        // navigate. WindowClient.navigate() is unreliable in iOS home-screen apps.
        try { await client.focus(); } catch { /* focus may be refused; still route */ }
        client.postMessage({ type: 'lemedia:navigate', url: path });
        return;
      }
      // App closed → open it straight on the target page.
      return self.clients.openWindow(absoluteUrl);
    })
  );
});
