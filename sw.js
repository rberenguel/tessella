const CACHE_NAME = "tessella-v0.7.2-permissions-fix";
const CACHE_FILES = [
  "./",
  "./canvas.css",
  "./fonts/InterDisplay-Bold.woff2",
  "./fonts/InterDisplay-Italic.woff2",
  "./fonts/InterDisplay-Regular.woff2",
  "./fonts/iconoir/iconoir.css",
  "./fonts/inter.css",
  "./fonts/jersey.css",
  "./fonts/jersey.ttf",
  "./index.html",
  "./libs/idb-keyval.js",
  "./libs/interact.min.js",
  "./manifest.json",
  "./media/favicon.ico",
  "./media/icon.png",
  "./src/camera.js",
  "./src/config.js",
  "./src/dom.js",
  "./src/haptic.js",
  "./src/main.js",
  "./src/palette.js",
  "./src/quantizer.js",
  "./src/rendering.js",
  "./src/state.js",
  "./src/ui.js",
];

// Install event: cache files and skip waiting to activate immediately
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log("Service Worker: Cache opened. Caching app shell...");
        await cache.addAll(CACHE_FILES);
        console.log("Service Worker: All app shell files cached successfully.");
        // Skip waiting to activate immediately
        await self.skipWaiting();
      } catch (error) {
        console.error("Service worker installation failed:", error);
      }
    })(),
  );
});

// Activate event: claim clients immediately and clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  event.waitUntil(
    (async () => {
      // Delete old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`Service Worker: Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        }),
      );
      // Take control of all pages immediately
      await self.clients.claim();
      console.log("Service Worker: Activated and claimed clients.");
    })(),
  );
});

// Listen for a message from the main app to cache palettes
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CACHE_PALETTES") {
    const palettesToCache = event.data.palettes;
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        console.log("Service Worker: Caching palettes dynamically...");
        return cache.addAll(palettesToCache).catch((err) => {
          console.error("Failed to cache palettes:", err);
        });
      }),
    );
  }
});

// Fetch event: Network-first strategy with cache fallback
// This ensures we always try to get fresh content, but fall back to cache if offline
self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      try {
        // Try network first
        const networkResponse = await fetch(event.request);

        // If successful, update cache with the new version
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          // Only cache GET requests
          if (event.request.method === "GET") {
            cache.put(event.request, networkResponse.clone());
          }
        }

        return networkResponse;
      } catch (error) {
        // Network failed, try cache
        console.log(
          `Service Worker: Network failed for ${event.request.url}, trying cache...`,
        );
        const cachedResponse = await caches.match(event.request);

        if (cachedResponse) {
          return cachedResponse;
        }

        // If both network and cache fail, return error
        console.error(
          `Service Worker: No cached response for ${event.request.url}`,
        );
        throw error;
      }
    })(),
  );
});
