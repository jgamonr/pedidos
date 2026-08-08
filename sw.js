const CACHE_NAME = 'fiesta-pedidos-v15';
const APP_SHELL = [
  './',
  './index.html',
  './invitado.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/photos/event-table.jpg',
  './assets/photos/drink-station.jpg',
  './assets/photos/kitchen-counter.jpg',
  './assets/photos/hamburguesa.jpg',
  './assets/photos/hot-dog.jpg',
  './assets/photos/agua-ponche.jpg',
  './assets/photos/latte-natural.jpg',
  './assets/photos/latte-crema-irlandesa.jpg',
  './assets/photos/latte-vainilla.jpg',
  './assets/og/og-controlpedidos.jpg',
  './assets/og/og-pedidos.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
