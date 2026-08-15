/* Page side of the NODD -> manifest -> service-worker chain.
 *
 * The worker writes manifest.json LAST, after its derived artifacts, so a manifest
 * naming an artifact is a promise that the artifact exists. This listener reads it,
 * works out which imagery slots have rolled off the board, and tells the service
 * worker to drop their tiles.
 *
 * NOT A POLLING LOOP. The manifest is re-read when the page becomes visible and when
 * the ingestion worker signals a new frame. The interval below is a floor for a tab
 * left open for hours, not the primary trigger — it is deliberately longer than the
 * 10-minute GOES full-disk cadence so it can never become the thing the board relies
 * on for freshness.
 */

const MANIFEST_URL = "/data/manifest.json";
const FLOOR_MS = 15 * 60 * 1000; // > the 10-minute full-disk cadence, with headroom

let knownSlots = new Set();

async function readManifest() {
  /* cache: "no-store" matters here. The manifest IS the freshness claim; serving it
     from the HTTP cache would reintroduce exactly the staleness docs/sw.js refuses to
     create. */
  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) {
    /* Honesty contract: a failed read records the failure and leaves the value null.
       It never falls back to the last good manifest, because a stale manifest
       presented as current is the failure this whole design is built to avoid. */
    return { ok: false, status: res.status, note: "manifest unreachable", value: null };
  }
  return { ok: true, status: res.status, note: null, value: await res.json() };
}

async function syncTileCache() {
  const manifest = await readManifest();
  if (!manifest.ok) {
    console.warn("manifest", manifest.status, manifest.note);
    return manifest;
  }

  const current = new Set(manifest.value.superseded_slots || []);
  const rolledOff = [...knownSlots].filter((s) => !current.has(s));
  knownSlots = current;

  if (rolledOff.length && navigator.serviceWorker?.controller) {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "TILE_SLOTS_SUPERSEDED", slots: rolledOff });
  }
  return manifest;
}

navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "TILE_SLOTS_EVICTED") {
    console.info(`tile cache: evicted ${event.data.evicted} entr(y|ies)`, event.data.slots);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") syncTileCache();
});

syncTileCache();
setInterval(syncTileCache, FLOOR_MS);

export { syncTileCache, readManifest };
