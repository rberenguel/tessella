const CACHE_NAME = "tessella-v0.6.3";
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

// Install event: opens a cache and adds the core files to it.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log("Cache opened. Caching app shell...");
        await cache.addAll(CACHE_FILES);
        console.log("All app shell files cached successfully.");
      } catch (error) {
        console.error("Service worker installation failed:", error);
      }
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

// Fetch event: serves assets from cache if available, otherwise fetches from network.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      return fetch(event.request);
    }),
  );
});

// Activate event: cleans up old caches.
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});

// Install event: opens a cache and adds the core files to it.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log("Cache opened. Caching files...");

        for (const url of CACHE_FILES) {
          try {
            await cache.add(url);
          } catch (error) {
            console.error(`Failed to cache: ${url}`, error);
            // If one file fails, you might want the whole installation to fail.
            // Re-throwing the error will cause the service worker installation to fail.
            throw error;
          }
        }

        console.log("All files cached successfully.");
      } catch (error) {
        console.error("Service worker installation failed:", error);
      }
    })(),
  );
});

// Fetch event: serves assets from cache if available, otherwise fetches from network.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      return fetch(event.request);
    }),
  );
});

// Activate event: cleans up old caches.
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});
