// Offline support: app shell cache-first, daily data network-first.
const VERSION = "cinque-v7";
const SHELL = ["./", "index.html", "styles.css", "app.js", "backend.js", "interests.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "vendor/anthropic-sdk.mjs"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (url.origin === location.origin && (url.pathname.includes("/data/") || url.pathname.includes("/config/"))) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  if (url.origin === location.origin || url.host.endsWith("fonts.gstatic.com") || url.host.endsWith("fonts.googleapis.com")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(VERSION).then((cache) => cache.put(event.request, copy));
            }
            return res;
          }),
      ),
    );
  }
});
