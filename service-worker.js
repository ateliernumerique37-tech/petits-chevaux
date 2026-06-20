const CACHE = 'petits-chevaux-v4';

const ASSETS = [
  './',
  './index.html',
  './regles.html',
  './style.css',
  './manifest.json',
  './bundle.js',
  './sounds/dice-roll.mp3',
  './sounds/dice-six.mp3',
  './sounds/move.mp3',
  './sounds/exit-stable.mp3',
  './sounds/capture.mp3',
  './sounds/home-stretch.mp3',
  './sounds/victory.mp3',
  './sounds/pass-turn.mp3',
  './sounds/pass-phone.mp3',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
