// Service worker for Cell Atelier.
//
// Generated at build time with the real asset list substituted in, so the cache
// is always in step with the bundle. Strategy: precache everything on install
// (the whole site is about 4 MB after compression), serve cache-first, and fall
// back to the cached shell for navigations so the page opens with no network.

const CACHE_NAME = '__CACHE_NAME__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Precache in CORS mode, which is how the page asks for its own bundle: Vite
    // emits `<script type=module crossorigin>` and matching `modulepreload`
    // links, and a static server answers those with `Vary: Origin`. Fetching
    // without an Origin header here stored responses that the page's requests
    // then could not match — the app booted to an empty loading overlay with no
    // network while every URL was demonstrably present in the cache.
    const results = await Promise.allSettled(PRECACHE.map((url) => cache.add(
      new Request(url, { cache: 'reload', mode: 'cors', credentials: 'same-origin' }),
    )));
    const failed = results.filter((result) => result.status === 'rejected').length;
    await report({ type: 'precache', cached: PRECACHE.length - failed, total: PRECACHE.length });
  })());
});

// Deliberately no skipWaiting() and no clients.claim().
//
// Both were tried, and both are a trap: a newly installed worker that activates
// while a page is loading claims that page, and the browser then drops the
// subresource requests already in flight. Letting a new worker wait until the
// last tab closes costs one reload after a deployment and removes the race.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE_NAME) await caches.delete(name);
    }
    await report({ type: 'ready', total: PRECACHE.length });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'status') {
    event.waitUntil(report({ type: 'ready', total: PRECACHE.length }));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const shell = await cache.match('./index.html');
      if (shell) return shell;
      try {
        return await fetch(request);
      } catch (error) {
        return new Response('离线且尚未缓存该页面。', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Strict match first, then a Vary-blind and a URL-shaped one: the bundle may
    // be requested with or without an Origin header depending on how the server
    // sets `Vary`, and a lesson must not depend on that.
    const hit = await cache.match(request, { ignoreSearch: true })
      ?? await cache.match(request, { ignoreSearch: true, ignoreVary: true })
      ?? await cache.match(new URL(request.url).pathname, { ignoreSearch: true, ignoreVary: true });
    if (hit) return hit;
    const response = await fetch(request);
    // Anything the page asks for that was not in the build (a new thumbnail,
    // say) joins the cache so it too survives the next offline lesson.
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  })());
});

async function report(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}
