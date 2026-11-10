// Offline cache for the page: once the site has been opened with internet, it opens and plays without it.
// Page, lists and notes library are fetched network-first (fresh when online, cached copy when not);
// sound bank, font, exercise files and CDN scripts cache-first. The page sends the list of exercise files to precache.
const VERSION = "drum-v1";
const SHELL = [
  "./", "index.html", "exercises.json", "workouts.json",
  "vendor/sonivox.sf2", "vendor/font/Bravura.woff2",
  "https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.4/dist/alphaTab.min.js",
];
const FRESH = /(\/|index\.html|exercises\.json|workouts\.json)$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: "reload" }))))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "precache") return;
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    for (const u of e.data.urls) { if (!(await c.match(u))) { try { await c.add(u); } catch {} } }
  }));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin && FRESH.test(url.pathname)) e.respondWith(networkFirst(req));
  else e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await withTimeout(fetch(req), 5000);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match("index.html")) || Response.error();
  }
}
async function cacheFirst(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") c.put(req, res.clone());
  return res;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
