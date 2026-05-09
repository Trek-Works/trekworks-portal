// =====================================================
// TrekWorks Portal Service Worker
// Scope: /
// Purpose: Keep the Trip Hub / Portal available offline
// =====================================================

const CACHE_VERSION = "trekworks-portal-2026-05-10-v1";
const CACHE_NAME = CACHE_VERSION;

// -----------------------------------------------------
// Core portal assets only — no legacy trip-folder paths
// -----------------------------------------------------
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/service-worker.js"
];

// -----------------------------------------------------
// Install — pre-cache the portal shell
// -----------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.allSettled(
        CORE_ASSETS.map(async (asset) => {
          const request = new Request(asset, { cache: "reload" });
          const response = await fetch(request);

          if (response && response.ok) {
            await cache.put(request, response.clone());
          }
        })
      );
    })()
  );

  self.skipWaiting();
});

// -----------------------------------------------------
// Activate — clean old TrekWorks portal/hub caches
// -----------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) =>
            (key.startsWith("trekworks-portal-") || key.startsWith("trekworks-hub-")) &&
            key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

// -----------------------------------------------------
// Fetch — navigation requests use network-first fallback
// -----------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  event.respondWith(handleAsset(event.request));
});

// -----------------------------------------------------
// Navigation strategy — latest online, cached offline
// -----------------------------------------------------
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
  } catch {
    // Network unavailable; use cache fallback below.
  }

  return (
    (await cache.match(request)) ||
    (await cache.match("/index.html")) ||
    (await cache.match("/")) ||
    new Response("TrekWorks Portal is offline and no cached copy is available yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    })
  );
}

// -----------------------------------------------------
// Asset strategy — cache-first, then network
// -----------------------------------------------------
async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
