/* StemLab service worker
 * Due cache separate:
 *  - APP_SHELL: i file dell'app (piccoli, aggiornati ad ogni release)
 *  - MODEL: i pesi del modello (grandi, ~45 MB, scaricati una volta sola)
 * Cambia APP_VERSION ad ogni release per invalidare la cache dell'app.
 * La cache del modello NON viene toccata, così l'utente non riscarica i pesi.
 */
const APP_VERSION = 'v1';
const APP_CACHE = `stemlab-app-${APP_VERSION}`;
const MODEL_CACHE = 'stemlab-model'; // volutamente senza versione

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './worker.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('stemlab-app-') && k !== APP_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // I pesi del modello vivono sotto /models/ : cache-first, persistente.
  if (url.pathname.includes('/models/')) {
    event.respondWith(
      caches.open(MODEL_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // App shell: stale-while-revalidate.
  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fetchPromise;
    })
  );
});
