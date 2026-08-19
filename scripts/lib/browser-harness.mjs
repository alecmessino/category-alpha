/* One deterministic browser environment for every harness that drives a page.
 *
 * THE HOLE THIS CLOSES. Each browser harness isolates itself the same way: a static server on
 * 127.0.0.1, and `page.route("**\/*")` aborting anything that is not it. The comment on that
 * line says the board "pulls map tiles from hosts a DOM check neither needs nor wants", and
 * aborting them is how it stopped. It did not stop them.
 *
 * docs/index.html registers docs/sw.js, a tile cache that INTERCEPTS requests to
 * gibs.earthdata.nasa.gov and basemaps.cartocdn.com and RE-ISSUES them itself with fetch().
 * Playwright's route interception does not cover service-worker-originated requests, so those
 * fetches leave the machine no matter what the route handler says. sw.js calls skipWaiting()
 * and clients.claim(), so whether it has taken control before the map asks for its first tile
 * is a race -- which makes the escape intermittent rather than absent.
 *
 * Measured on ba6954a: check-panel-dom failed CI with 22 page errors, every one
 * "Failed to load resource: the server responded with a status of 404 ()" carrying no URL,
 * while `MISSING` was empty -- proving not one of them was same-origin. They were tile slots
 * GIBS has no imagery for. check-atlas-dom passed the same run on the same Chromium because
 * docs/storm-atlas/index.html registers no worker: the presence of the service worker is the
 * only material difference between the two harnesses.
 *
 * It is green on a development container only because the browser there cannot reach those
 * hosts at all -- the fetches fail with net::ERR_ class errors, which every harness filters as
 * its own doing. So the local result never depended on the isolation holding; it depended on
 * the network being unreachable. That is not a test, and it is why this is asserted below
 * rather than assumed.
 *
 * WHY BLOCKING IS NOT AN EXEMPTION. The alternative -- filtering 404s out of the console --
 * would be the "ignore 404s" drift both DOM checks explicitly warn against, and would blind
 * them to a genuinely missing application asset. The 404s were real. They were third-party.
 * The fix is to stop the traffic, not to stop reporting it.
 *
 * Nothing under test depends on the worker. sw.js refuses same-origin requests by design --
 * "it MUST NOT touch same-origin requests" -- so it can only ever serve tiles, and
 * docs/index.html documents its registration as best-effort: "the page is fully functional
 * without it". Blocking it adds no noise either: register() rejects into a console.warn, and
 * every harness keys on m.type() === "error".
 */

/* Spread into newContext()/newPage() options. browser.newPage() takes context options too. */
export const HERMETIC = { serviceWorkers: "block" };

/* THE PROPERTY, DEFINED ONCE. Returns null when the page is isolated, or a description of the
 * escape when it is not. It returns rather than throws so each harness can report it through
 * its own reporter -- ok() here, an errors.push() there, a failed budget in the benchmark.
 *
 * A page with no navigator.serviceWorker (a non-secure context) has no way to register one, so
 * it is isolated for the purpose this asks about.
 */
export async function serviceWorkerEscape(page) {
  const script = await page.evaluate(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return null;
    return sw.controller ? sw.controller.scriptURL : null;
  });
  return script
    ? `a service worker controls this page (${script}); its fetches bypass page.route and leave the machine`
    : null;
}
