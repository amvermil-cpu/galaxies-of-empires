// Galaxies of Empires — offline service worker (network-first, falls back to cache when offline)
// v2.1 item 6: always revalidate with the server (no stale HTTP-cache copies), so one load never mixes files from two versions
const CACHE = 'goe-v3.1.0';
const FILES = ['./', './index.html', './style.css', './manifest.webmanifest', './js/data.js', './js/state.js', './js/sim.js', './js/v14.js', './js/v15.js', './js/v20.js', './js/v21.js', './js/v22.js', './js/v23.js', './js/v24.js', './js/v25.js', './js/v26.js', './js/v27.js', './js/v28.js', './js/v29.js', './js/v30.js', './js/v31.js', './js/render.js', './js/gfx.js', './js/audio.js', './js/ui.js', './js/main.js', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(resp => { if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return resp; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
