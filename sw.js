importScripts('./sw-version.js');

const CACHE = `pid-ar-shell-${self.PID_AR_BUILD_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/pid-ar-v2-192.png',
  './icons/pid-ar-v2-512.png',
  './icons/pid-ar-v2-maskable-512.png',

  './js/app.js',
  './js/share.js',
  './js/qr-code.js',
  './js/vendor/qrcode-generator.js',
  './js/vendor/LICENSE.qrcode-generator',
  './js/build-update.js',
  './js/build-version.js',
  './js/config.js',
  './js/map-mode.js',
  './js/view-mode-controller.js',
  './js/vendor/maplibre-gl.js',
  './css/vendor/maplibre-gl.css',
  './js/dataset-status.js',
  './js/enhanced-ar.js',
  './js/geo.js',
  './js/service-area.js',
  './js/storage.js',
  './js/orientation.js',
  './js/permissions.js',
  './js/markers.js',
  './js/position-stabilizer.js',
  './js/location-tracking.js',

  './api/departures.js'
];

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);

  try {
    // Bypass the browser HTTP cache: every entry in a shell cache must come
    // from this deployment, rather than being a mixture of old ES modules.
    for (const path of SHELL) {
      const request = new Request(path, { cache: 'reload' });
      const response = await fetch(request);

      if (!response.ok) {
        throw new Error(`Shell fetch failed: ${path} (${response.status})`);
      }

      await cache.put(request, response);
    }
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
})()));

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event =>
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key.startsWith('pid-ar-shell-') &&
              key !== CACHE
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
);

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Mapy.com raster tiles always use the network and are never cached.
  if (url.hostname === 'api.mapy.com') return;

  if (
    url.pathname.includes('/data/pid-stops') ||
    url.pathname.endsWith('/data/pid-service-area.json') ||
    url.pathname.endsWith('/build-version.json')
  ) {
    return;
  }

  const shellAsset =
    url.origin === location.origin &&
    (
      event.request.mode === 'navigate' ||
      /\.(?:js|css|html)$/.test(url.pathname)
    );

  const networkRequest = shellAsset
    ? new Request(event.request, { cache: 'reload' })
    : event.request;

  event.respondWith(
    fetch(networkRequest)
      .then(response => {
        if (response.ok && url.origin === location.origin) {
          caches.open(CACHE)
            .then(cache => cache.put(
              event.request,
              response.clone()
            ));
        }

        return response;
      })
      .catch(() =>
        caches.match(event.request)
          .then(response =>
            response || caches.match('./index.html')
          )
      )
  );
});
