// Service Worker: speichert alle Dateien der App beim ersten Laden, danach läuft alles offline.
// Pfade sind relativ zum Ort dieser Datei, daher funktioniert er auch unter einem
// GitHub-Pages-Unterpfad (Scope = Verzeichnis von sw.js).
const VERSION = "__VERSION__"; // wird beim Veröffentlichen durch die Commit-ID ersetzt
const CACHE = `fuehrungsvergabe-${VERSION}`;
const DATEIEN = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/main.js",
  "./js/model.js",
  "./js/codec.js",
  "./js/excel.js",
  "./js/solver.js",
  "./js/ical.js",
  "./js/store.js",
  "./js/demo.js",
  "./js/ui-common.js",
  "./js/ui-person.js",
  "./js/ui-koord.js",
  "./js/markdown.js",
  "./ANLEITUNG.md",
  "./vendor/lz-string.mjs",
  "./vendor/fflate.mjs",
  "./vendor/highs.mjs",
  "./vendor/highs.wasm",
  "./vorlage-fuehrungen.xlsx",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN.map((d) => new Request(d, { cache: "reload" })))));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fuehrungsvergabe-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (ev) => {
  if (ev.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === "navigate") {
        return (await cache.match("./index.html")) ?? fetch(req);
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch {
        return new Response("offline", { status: 503, statusText: "offline" });
      }
    })(),
  );
});
