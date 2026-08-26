const CACHE_NAME = "original-evidence-desk-v4";
const APP_ROOT = new URL("./", self.location.href).pathname;
const appAsset = (name) => `${APP_ROOT}${name}`;
const STATIC_SHELL = [
  appAsset("manifest.webmanifest"),
  appAsset("icon-192.png"),
  appAsset("icon-512.png"),
  appAsset("apple-touch-icon.png"),
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const pageResponse = await fetch(APP_ROOT, { cache: "reload" });
    if (!pageResponse.ok) throw new Error(`Unable to cache app shell: ${pageResponse.status}`);

    await cache.put(APP_ROOT, pageResponse.clone());
    const html = await pageResponse.text();
    const appBase = new URL(APP_ROOT, self.location.origin);
    const discoveredAssets = new Set();

    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
      const url = new URL(match[1], appBase);
      if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) continue;
      if (url.pathname.includes("/_next/static/") || /\.(?:css|js|woff2?)$/i.test(url.pathname)) {
        discoveredAssets.add(url.href);
      }
    }

    await cache.addAll([...STATIC_SHELL, ...discoveredAssets]);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_ROOT, copy));
          return response;
        })
        .catch(() => caches.match(APP_ROOT)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
