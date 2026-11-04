/* Chatly service worker.
   Caches only same-origin static assets. Firebase, Cloudinary, Google Fonts
   and every other cross-origin request are never intercepted, so private chat
   data can never end up in the cache. */
const CACHE_NAME = 'chatly-static-v2';
const PRECACHE = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__/')) return;
  // Never cache API responses (cleanup endpoint and future dynamic routes).
  if (url.pathname.startsWith('/api/')) return;

  // App navigation: always try the network so a new deploy is picked up.
  // Fall back to the offline page only when the device is offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/offline.html'))
      )
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

/* Push notifications — delivered even when the app is closed. */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const data = payload.data || payload;
  const title = data.title || 'Chatly';
  const isCall = data.type === 'call';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'New message',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || (isCall ? 'chatly-call' : 'chatly-message'),
      renotify: true,
      requireInteraction: isCall,
      vibrate: isCall
        ? [1000, 500, 1000, 500, 1000, 500, 1000]
        : [200, 100, 200],
      data: {
        url: data.url || '/',
        conversationId: data.conversationId || '',
        callId: data.callId || '',
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  // For calls, just focus the app: the ringing overlay is already driven by
  // the live call document, and navigating away would lose the open chat.
  const isCall = Boolean(event.notification.data?.callId);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          if (!isCall && 'navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Focus the existing window even if navigation is blocked.
            }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});
