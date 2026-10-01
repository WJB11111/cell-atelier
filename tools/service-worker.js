// Service worker for Cell Atelier.
//
// Generated at build time with the real asset list substituted in, so the cache
// is always in step with the bundle.
//
// Two-stage strategy, and the staging is the point. Install fetches only the
// shell — HTML, bundle, manifest, icons, about 700 KB — because that always
// finishes. The four megabytes of models and thumbnails are fetched afterwards,
// in the background, on the page's request. Waiting for all of them during
// install looked fine on a fast connection and hung on a slow one: the browser
// abandons an install that stalls, and the site then silently never becomes
// offline-capable at all. A model opened before the warm-up reaches it is cached
// by the fetch handler anyway.

const CACHE_NAME = '__CACHE_NAME__';
const PRECACHE = __PRECACHE__;
//: models and images: whatever makes the cache heavy
const HEAVY = /\.(glb|png|jpg|jpeg|webp)$/i;
const SHELL = PRECACHE.filter((url) => !HEAVY.test(url));
const MEDIA = PRECACHE.filter((url) => HEAVY.test(url));

const FETCH_OPTIONS = {
  cache: 'reload',
  // CORS mode, because that is how the page asks for its own bundle: Vite emits
  // `<script type=module crossorigin>`, and a server answering with
  // `Vary: Origin` otherwise refuses to match what was stored here.
  mode: 'cors',
  credentials: 'same-origin',
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.allSettled(
      SHELL.map((url) => cache.add(new Request(url, FETCH_OPTIONS))),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    await report({
      type: 'shell',
      cached: SHELL.length - failed,
      total: SHELL.length,
      media: MEDIA.length,
    });
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

/** Fetch the models and thumbnails one by one, reporting progress as it goes. */
async function warmMedia() {
  const cache = await caches.open(CACHE_NAME);
  let done = 0;
  for (const url of MEDIA) {
    try {
      const already = await cache.match(url, { ignoreSearch: true, ignoreVary: true });
      if (!already) await cache.add(new Request(url, FETCH_OPTIONS));
      done += 1;
    } catch (error) {
      // One failure must not stop the rest: what arrived is still usable offline,
      // and the next visit picks up where this one left off.
    }
    await report({ type: 'warming', cached: done, total: MEDIA.length });
  }
  await report({ type: 'warm', cached: done, total: MEDIA.length });
  return done;
}

let warming = null;

self.addEventListener('message', (event) => {
  if (event.data === 'status') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      const have = MEDIA.filter((url) => keys.some((request) => request.url.endsWith(url.slice(2)))).length;
      await report({
        type: have >= MEDIA.length ? 'warm' : 'ready',
        cached: have,
        total: MEDIA.length,
      });
    })());
    return;
  }
  if (event.data === 'warm') {
    warming = warming ?? warmMedia();
    event.waitUntil(warming);
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
