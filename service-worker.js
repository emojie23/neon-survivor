const CACHE = 'neon-survivor-v5-smooth-joystick';
const FILES = [
  './', './index.html', './styles.css', './game.js', './manifest.webmanifest',
  './assets/character-triptych.png',
  './assets/boss-floor-1.png', './assets/boss-floor-2.png', './assets/boss-floor-3.png',
  './assets/boss-floor-4.png', './assets/boss-floor-5.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  })));
});
