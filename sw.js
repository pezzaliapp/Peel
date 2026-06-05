/* Peel service worker
 * Due cache separate:
 *  - APP_SHELL: i file dell'app (piccoli, aggiornati ad ogni release)
 *  - MODEL: i pesi del modello (grandi, ~45 MB, scaricati una volta sola)
 * Cambia APP_VERSION ad ogni release per invalidare la cache dell'app.
 * La cache del modello NON viene toccata, così l'utente non riscarica i pesi.
 */
const APP_VERSION = 'v2';
const APP_CACHE = `peel-app-${APP_VERSION}`;
const MODEL_CACHE = 'peel-model'; // volutamente senza versione

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
    (async () => {
      // Elimina SOLO le vecchie cache dell'app (peel-app-*). La cache dei pesi
      // del modello (peel-model, senza versione) NON viene mai toccata qui.
      const keys = await caches.keys();
      const oldAppCaches = keys.filter(
        (k) => k.startsWith('peel-app-') && k !== APP_CACHE
      );
      await Promise.all(oldAppCaches.map((k) => caches.delete(k)));

      // Prendi subito il controllo delle pagine già aperte.
      await self.clients.claim();

      // Se c'era una versione precedente (cioè è un aggiornamento, non il
      // primo install), ricarica una volta sola le pagine aperte così che
      // applichino subito la nuova versione dell'app.
      if (oldAppCaches.length > 0) {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.navigate(client.url).catch(() => {});
        }
      }
    })()
  );
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
