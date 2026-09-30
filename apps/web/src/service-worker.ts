/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';
const sw = self as unknown as ServiceWorkerGlobalScope;
const cacheName = `zivizip-shell-${version}`;
const assets = [...build, ...files, '/'];
sw.addEventListener('install', (event) =>
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets))),
);
sw.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('zivizip-shell-') && key !== cacheName)
          await caches.delete(key);
      await sw.clients.claim();
    })(),
  ),
);
sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== sw.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (!assets.includes(url.pathname) && event.request.mode !== 'navigate')
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      if (event.request.mode === 'navigate') {
        try {
          return await fetch(event.request);
        } catch {
          return (await cache.match('/'))!;
        }
      }
      return (await cache.match(event.request)) || fetch(event.request);
    })(),
  );
});
