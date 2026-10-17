// Offline support: the app shell loads from cache when there's no signal.
// Network first for the app's own files so updates show up right away.

const CACHE = "phase10-v2";
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/onboarding.js", "js/game.js", "js/presets.js", "js/config.js",
  "js/vendor/qrcode.js", "js/sync/index.js", "js/sync/local.js", "js/sync/firebase.js",
  "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Firestore traffic must always go to the network.
  if (url.hostname.endsWith("googleapis.com") && !url.hostname.startsWith("fonts.")) return;
  const sameOrigin = url.origin === location.origin;
  const cacheable = sameOrigin || url.hostname === "www.gstatic.com" || url.hostname === "cdnjs.cloudflare.com" || url.hostname.startsWith("fonts.");
  if (!cacheable) return;
  e.respondWith(
    // no-cache: always check for a newer copy, so updates show on the next open.
    // (A fresh Request by URL, since page navigations can't take a cache option directly.)
    fetch(sameOrigin ? new Request(url.href, { cache: "no-cache", credentials: "same-origin" }) : e.request)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
