const CACHE = 'cdss-cache-r020-v1';
const STATIC_ASSETS = [
  '/',
  '/cdss.html',
  '/config_loader.js',
  '/config/calibration_map.json',
  '/config/disease_panels.json',
  '/config/marker_strength.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];
const NETWORK_FIRST = ['/predict'];
const PROTECTED_JSON_PATTERNS = [
  /\/config\/coef_map\.json$/,
  /\/config\/thresholds\.json$/,
  /\/config\/score_norm\.json$/,
  /\/case_pack\/cases_public\.json$/,
  /\/case_pack\/cases_answer\.json$/,
  /\/cdss\/lab_master_v1\.json$/,
  /\/lab_master_v1\.json$/
];

function isProtectedJson(url) {
  return PROTECTED_JSON_PATTERNS.some(pattern => pattern.test(url.pathname));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (isProtectedJson(url)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (NETWORK_FIRST.some(path => url.pathname.startsWith(path))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
