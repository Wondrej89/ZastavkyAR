importScripts('./sw-version.js');
const CACHE = `pid-ar-shell-${self.PID_AR_BUILD_VERSION}`;
const SHELL = ['./','./index.html','./styles.css','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.svg','./icons/icon-512.svg','./js/app.js','./js/build-update.js','./js/build-version.js','./js/config.js','./js/dataset-status.js','./js/geo.js','./js/storage.js','./js/orientation.js','./js/markers.js','./js/position-stabilizer.js','./api/departures.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pid-ar-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.includes('/data/pid-stops') || url.pathname.endsWith('/build-version.json')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && url.origin === location.origin) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html'))));
});
