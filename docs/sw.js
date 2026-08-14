/* Tile cache — and NOTHING else.
 *
 * The map re-downloads the same GIBS and CARTO tiles every time a layer is toggled or
 * the tab is switched, which is the slowest thing the page does. A cache-first store
 * for those tiles makes the map feel instant on the second look.
 *
 * The hard rule, and the reason this file is so short: it MUST NOT touch same-origin
 * requests. This terminal's entire claim is that what is on screen is current, and a
 * service worker that served a cached index.html or a cached latest.json would make
 * that claim false while every freshness indicator on the page kept saying otherwise —
 * a stale board that looks live is worse than no board. Only the two raster-tile hosts
 * are eligible, and only for GET.
 *
 * Tiles are addressed by timestamp (GOES publishes a new path every 10 minutes) so a
 * cached tile can never be a stale version of a current tile — it is either the tile
 * for that slot or it does not exist.
 */
const CACHE = "mt-tiles-v1";
const MAX_ENTRIES = 900;          // ~25 MB of 256px PNGs; well inside origin quota
const TILE_HOSTS = ["gibs.earthdata.nasa.gov", "basemaps.cartocdn.com"];

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* Cheap FIFO trim. Cache.keys() is insertion-ordered, so dropping from the front
   evicts the oldest tiles, which are the ones for imagery slots that have rolled over. */
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(k);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin === self.location.origin) return;                 // never our own assets
  if (!TILE_HOSTS.some((h) => url.hostname.endsWith(h))) return;   // never anything else

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    /* A tile request that fails must fail the way it would without this worker, so the
       map's own errorTileUrl draws the dark skeleton instead of a broken image. */
    const res = await fetch(req);
    if (res && res.status === 200) { cache.put(req, res.clone()); trim(cache); }
    return res;
  })());
});
