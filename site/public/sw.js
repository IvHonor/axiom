// Axiom installed from the browser (a phone's home screen, or a desktop
// browser's "Install app"): what lets it open with no connection. The data
// itself already lives on the device (IndexedDB) with edits queued to sync;
// this keeps the app that shows it.
//
// - The app's page (/terminal): the newest when online, the last one when not.
// - Its files (/app/assets/…): named after their contents, so they never
//   change; kept once fetched.
// - /api (the account, sync): never kept. Always the live answer.

const CACHE = "axiom-app-v1";
const PAGE = "/terminal";
/** Old builds' files pile up as Axiom updates; past this many, the oldest go. */
const MAX_FILES = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(PAGE))
      .catch(() => {}) // Offline while installing: the page is kept on the next visit.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function keep(request, response) {
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) {
    if (new URL(old.url).pathname !== PAGE) await cache.delete(old);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" && (url.pathname === PAGE || url.pathname.startsWith(`${PAGE}/`))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(keep(PAGE, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(PAGE)) ?? Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith("/app/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (kept) =>
          kept ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(keep(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
