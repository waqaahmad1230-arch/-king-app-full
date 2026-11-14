self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());

self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Cache GamePix and HTML5 game resources for offline play
  if (url.includes('gamepix.com') || url.includes('gamedistribution') || url.includes('html5')) {
    event.respondWith(
      caches.open('king-gamepix-cache-v1').then(cache => {
        return cache.match(event.request).then(cached => {
          const fetched = fetch(event.request).then(res => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetched;
        });
      })
    );
  }
});
