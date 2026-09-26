const CACHE = 'parkmap-v1';
const SHELL = ['/parkmap/', '/parkmap/index.html', '/parkmap/manifest.webmanifest', '/parkmap/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // geojson-data: network-first (färsk data viktigt), fallback cache
  if (u.pathname.includes('/data/') || u.pathname.endsWith('.geojson')) {
    e.respondWith(fetch(e.request).then(r => { const cc=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cc)); return r; }).catch(()=>caches.match(e.request)));
    return;
  }
  // app-skal: cache-first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
