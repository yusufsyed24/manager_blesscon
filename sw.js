const CACHE = "blesscon-static-v55-57-user-profile-creation-20261023";
const ASSETS = [
  "./",
  "./index.html",
  "./app_config.js",
  "./css/app.css",
  "./js/app.js",
  "./js/brand.js",
  "./js/pdf-font.js",
  "./js/domain.js",
  "./js/importer.js",
  "./js/exporter.js",
  "./js/documents.js",
  "./js/store.js",
  "./js/reports.js",
  "./assets/logo.jpeg",
  "./assets/logo-square.png",
  "./vendor/supabase.js",
  "./vendor/xlsx.full.min.js",
  "./vendor/jspdf.umd.min.js",
  "./vendor/chart.umd.js",
  "./manifest.json",
];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.includes("/functions/") || path.includes("/rest/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (
          r.ok &&
          ASSETS.some(
            (a) => new URL(a, self.registration.scope).pathname === path,
          )
        ) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then(
            (r) =>
              r ||
              (e.request.mode === "navigate"
                ? caches.match("./index.html")
                : Response.error()),
          ),
      ),
  );
});
