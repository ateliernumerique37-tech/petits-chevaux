// Bump à chaque déploiement reste UTILE (nettoyage des vieux caches) mais n'est
// PLUS critique pour la fraîcheur : la stratégie network-first ci-dessous garantit
// que la PWA charge toujours la dernière version déployée tant qu'elle est en ligne,
// même si on oublie de changer ce numéro.
const CACHE = 'petits-chevaux-v19';

// Pré-cache pour le mode hors ligne uniquement (fallback réseau indisponible).
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
    caches.open(CACHE)
      // allSettled : un seul asset en échec ne doit pas faire échouer toute
      // l'installation (sinon la mise à jour reste bloquée).
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // Ne gérer que les GET de notre propre origine.
  // Tout le reste (CDN Firebase gstatic, Realtime Database, websockets…)
  // passe directement au réseau, le SW n'y touche pas.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isSound = url.pathname.includes('/sounds/');

  if (isSound) {
    // Sons : cache-first (gros fichiers, ne changent quasiment jamais).
    e.respondWith(
      caches.match(req).then(cached =>
        cached || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
      )
    );
    return;
  }

  // Cœur de l'app (HTML, JS, CSS, manifest) : NETWORK-FIRST.
  // On récupère toujours la dernière version en ligne ; le cache n'est utilisé
  // qu'en secours quand le réseau est indisponible (mode hors ligne).
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached => cached || caches.match('./index.html'))
      )
  );
});
