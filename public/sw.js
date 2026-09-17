// Service worker : garde l'app disponible sans réseau (pages du téléphone + fichiers JS/CSS).
// Les courses elles-mêmes sont dans le stockage du navigateur, pas dans ce cache.

const VERSION = "v1";
const PAGES_CACHE = `pacing-pages-${VERSION}`;
const ASSETS_CACHE = `pacing-assets-${VERSION}`;
const OFFLINE_PAGES = ["/telephone", "/telephone/plan", "/telephone/course"];
const STATIC_FILES = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];
const NETWORK_TIMEOUT_MS = 3500;
const ASSET_URL = /\/_next\/static\/[^"'\\\s<>()]+/g;

/** Met en cache les fichiers /_next/static référencés par une page ou une feuille CSS (polices). */
async function cacheReferencedAssets(response) {
  const text = await response.text();
  const cache = await caches.open(ASSETS_CACHE);
  const urls = new Set(text.match(ASSET_URL) || []);
  await Promise.all(
    [...urls].map(async (url) => {
      if (await cache.match(url)) return;
      try {
        const asset = await fetch(url);
        if (!asset.ok) return;
        if (url.endsWith(".css")) await cacheReferencedAssets(asset.clone());
        await cache.put(url, asset);
      } catch {
        // Réseau coupé pendant la mise en cache : on réessaiera à la prochaine visite.
      }
    }),
  );
}

async function cachePage(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || response.redirected) return;
  await cacheReferencedAssets(response.clone());
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(new URL(url, self.location.origin).pathname, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(OFFLINE_PAGES.map((page) => cachePage(page).catch(() => undefined)));
      const assets = await caches.open(ASSETS_CACHE);
      await Promise.all(STATIC_FILES.map((file) => assets.add(file).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [PAGES_CACHE, ASSETS_CACHE];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// La page signale ce qu'elle a chargé avant que le service worker ne soit actif.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS") return;
  event.waitUntil(
    (async () => {
      const assets = await caches.open(ASSETS_CACHE);
      for (const url of event.data.urls) {
        const { pathname } = new URL(url, self.location.origin);
        try {
          if (pathname.startsWith("/_next/static/")) {
            if (!(await assets.match(pathname))) await assets.add(pathname);
          } else if (!pathname.startsWith("/api/")) {
            await cachePage(url);
          }
        } catch {
          // Ignoré : la ressource sera mise en cache lors d'une prochaine requête.
        }
      }
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/** Réseau d'abord (version à jour), cache si le réseau est coupé ou trop lent. */
async function networkFirstPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  // Même HTML pour toutes les courses : /telephone/course?id=… est rangé sous /telephone/course.
  const key = new URL(request.url).pathname;
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.type === "basic" && !response.redirected) {
      await cache.put(key, response.clone());
    }
    return response;
  });
  network.catch(() => undefined);

  try {
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    return (await cache.match(key)) || (await network);
  } catch {
    return (await cache.match(key)) || (await cache.match("/telephone")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  } else if (STATIC_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // Requêtes RSC de navigation interne : hors-ligne, Next.js retombe sur un chargement de page classique.
});
