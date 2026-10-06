// AoE2 Auto Scout service worker. Pages and the site's own files are fetched network-first (and always
// revalidated, since GitHub Pages lets browsers cache files for 10 minutes), so
// updates show up immediately; the cache is only a fallback when offline. Anything on another
// origin (live match data, player data, API calls) is never touched, so numbers are never stale.
const CACHE = 'autoscout-v3';
const SHELL = [
  './', 'index.html', 'player.html', 'insights.html', 'competitive.html', 'civ-insights.html',
  'build-order.html', 'investigations.html', 'tournament-player.html', 'launch.html', 'manifest.webmanifest', 'pwa.js',
  'app-icons/icon-192.png', 'app-icons/icon-512.png', 'app-icons/favicon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit ||
          (req.mode === 'navigate' ? caches.match(req, { ignoreSearch: true }).then(h => h || caches.match('index.html')) : Response.error()))
      )
  );
});
