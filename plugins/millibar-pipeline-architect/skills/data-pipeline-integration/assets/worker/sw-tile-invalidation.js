/* NODD-driven tile-cache invalidation — an ADDITIVE extension to docs/sw.js.
 *
 * Append this to docs/sw.js. It reuses that file's existing CACHE and TILE_HOSTS
 * constants and adds no new scope of its own.
 *
 * THE CONSTRAINT IT MUST NOT BREAK. docs/sw.js caches raster tiles from
 * gibs.earthdata.nasa.gov and basemaps.cartocdn.com only, and never touches
 * same-origin requests. That is load-bearing: a cached index.html or latest.json
 * would make the terminal's freshness claim false while every indicator on the
 * page kept saying otherwise — a stale board that looks live is worse than no
 * board. This extension evicts superseded TILE entries and nothing else.
 *
 * WHY IT IS QUOTA MANAGEMENT, NOT CORRECTNESS. GIBS and GOES tiles are addressed
 * by timestamp, so a cached tile can never be a stale version of a current tile —
 * it is either the tile for that slot or it does not exist. Eviction here reclaims
 * space once a slot has rolled off the board. It must never be widened into a
 * correctness mechanism, because the moment it is, someone will reach for it to
 * invalidate same-origin data and the guarantee above is gone.
 *
 * DRIVEN BY. The NODD worker writes manifest.json last (it is the commit point).
 * The page reads the manifest, notices slots that have rolled off, and posts them
 * here. No polling on either side of that boundary.
 */

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "TILE_SLOTS_SUPERSEDED") return;

  const slots = Array.isArray(msg.slots) ? msg.slots.filter((s) => typeof s === "string" && s) : [];
  if (!slots.length) return;

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let evicted = 0;

    for (const req of await cache.keys()) {
      let url;
      try { url = new URL(req.url); } catch { continue; }

      /* Belt and braces behind the fetch handler's own guard. If a future edit ever
         widens what gets cached, this loop still refuses to delete anything that is
         not a tile — an eviction path that can reach same-origin is one bad merge
         away from being an invalidation path that can reach same-origin. */
      if (url.origin === self.location.origin) continue;
      if (!TILE_HOSTS.some((h) => url.hostname.endsWith(h))) continue;

      /* GIBS encodes the time dimension as a path segment, so a slot string appears
         verbatim in the tile URL. Both the ISO instant and the date-only form are
         accepted because GIBS layers differ: GOES GeoColor is 10-minute, VIIRS
         CorrectedReflectance is daily. */
      const dateOnly = slots.map((s) => s.slice(0, 10));
      const hit = slots.some((s) => url.pathname.includes(s)) ||
                  dateOnly.some((d) => url.pathname.includes(d));

      if (hit) { await cache.delete(req); evicted++; }
    }

    /* Report back so the page can log what happened. Silence about an eviction that
       did nothing is how a no-op invalidation survives for months. */
    for (const client of await self.clients.matchAll()) {
      client.postMessage({ type: "TILE_SLOTS_EVICTED", evicted, slots });
    }
  })());
});
