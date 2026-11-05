// Offline support: the page is fetched fresh when online and served from cache when not.
const VERSION = 'ds-v1';
const FONTS = 'ds-fonts';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      // network first, so a new version shows up on the next open
      e.respondWith(fetch(url.pathname, {cache: 'no-cache'})
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./', copy)); } return res; })
        .catch(() => caches.match('./')));
      return;
    }
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req)));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
  }
});
