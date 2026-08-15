/* When each advisory actually went out.
 *
 * The backtest's zero-peek gate admitted a cycle's guidance at its DTG. That is wrong and it
 * is wrong in the direction that flatters the engine: cycle 2024092518's advisory did not
 * transmit until 20:51Z, so replaying at 18:00Z reads a forecast nobody had yet — and worse,
 * a forecast that had already absorbed the recon fix the engine is about to apply again.
 *
 * The transmission time is in the FILENAME of the archived message, to the minute:
 *
 *   al092024.fstadv.010.09252055   ->  Helene adv 10, sent 25 Sep 20:55Z
 *   ^^^^^^^^ ^^^^^^ ^^^ ^^^^^^^^
 *   storm    product num MMDDHHMM
 *
 * Measured over all 398 fstadv in 2024: transmission runs from 146 min early to 177 min
 * late against the nominal slot, median 19 min EARLY. 391 of 398 went out before their
 * nominal time, so "nominal" is not a safe proxy in either direction.
 *
 * The body's "2100 UTC" line is the nominal hour, not the send time. Do not use it.
 *
 * No fetch and no clock in here — the caller supplies both, so this stays testable.
 */

/* The scheduled advisory slots, UTC. A special advisory can land off them. */
const SLOTS = [3, 9, 15, 21];

/* Filenames carry MMDDHHMM with no year; the year comes from the directory. A storm running
   across New Year would need care, but no Atlantic or Pacific storm has. */
export function transmitMs(mmddhhmm, year) {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(mmddhhmm || ""));
  if (!m || !year) return null;
  const [, mo, dd, hh, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59) return null;
  const ms = Date.UTC(Number(year), mo - 1, dd, hh, mi);
  /* Reject a date the calendar rolled over — 0231 must not silently become 2 March. */
  const d = new Date(ms);
  if (d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== dd) return null;
  return ms;
}

const LINE = /href="([a-z]{2}\d{6})\.(fstadv|public|public_a|public_b)\.(\d+)\.(\d{8})"/gi;

/* Parse a messages/ directory index. One request per year covers every storm, basin and
   product, and every field needed is in the href — no bodies are fetched. */
export function parseMessagesIndex(html, year) {
  const out = [];
  const seen = new Set();
  for (const m of String(html || "").matchAll(LINE)) {
    const [, stormId, product, num, stamp] = m;
    const ms = transmitMs(stamp, year);
    if (ms == null) continue;
    const key = stormId + "|" + product + "|" + num + "|" + stamp;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ stormId: stormId.toLowerCase(), product: product.toLowerCase(),
               advNum: Number(num), transmitMs: ms });
  }
  return out.sort((a, b) => a.transmitMs - b.transmitMs);
}

/* Everything published for one storm, in send order.
 *
 * The union of fstadv, public and public_a matters and is not cosmetic: an intermediate
 * advisory publishes a recon fix just as a full one does, so leaving public_a out makes a
 * fix look unpublished when NHC had already put it on the wire. Measured on Milton, folding
 * the intermediates in takes the steps where a fix still looks new from 14 of 21 to 0. */
export function advisoryTimeline(entries, stormId, opts) {
  const o = opts || {};
  const products = o.products || ["fstadv", "public", "public_a"];
  const id = String(stormId || "").toLowerCase();
  return (entries || [])
    .filter((e) => e.stormId === id && products.includes(e.product))
    .sort((a, b) => a.transmitMs - b.transmitMs);
}

/* The advisory in force at t: the last one that had actually been sent. */
export function advisoryInForce(timeline, tMs) {
  if (!Array.isArray(timeline) || tMs == null) return null;
  let best = null;
  for (const e of timeline) {
    if (e.transmitMs > tMs) break;
    best = e;
  }
  return best;
}

/* WHEN A CYCLE'S GUIDANCE BECAME PUBLIC.
 *
 * A cycle produces the first forecast advisory sent after its DTG. The window is capped at
 * one full cycle so a storm whose advisories stop does not borrow the next storm's, and the
 * cap is a real case: a-deck OFCL rows exist for cycles whose advisory was issued by WPC and
 * is absent from this archive, and those must return null rather than the wrong advisory.
 *
 * Returns null when nothing matches. The caller decides what to do with that — dropping the
 * step is honest, assuming DTG is not. */
export function cycleTransmitMs(timeline, cycleDtgMs, opts) {
  const o = opts || {};
  const windowMs = (o.windowHours || 6) * 3600e3;
  if (!Array.isArray(timeline) || cycleDtgMs == null) return null;
  for (const e of timeline) {
    if (e.product !== "fstadv") continue;
    if (e.transmitMs <= cycleDtgMs) continue;
    if (e.transmitMs > cycleDtgMs + windowMs) return null;
    return e.transmitMs;
  }
  return null;
}

/* How far a set of advisories ran from their nominal slot. Diagnostic only — the gate uses
   real send times — but it is what shows "nominal" to be unusable as a proxy. */
export function offsetFromNominal(entryMs) {
  if (entryMs == null) return null;
  const d = new Date(entryMs);
  const min = d.getUTCHours() * 60 + d.getUTCMinutes();
  let best = null;
  for (const s of SLOTS) {
    let diff = min - s * 60;
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    if (best == null || Math.abs(diff) < Math.abs(best)) best = diff;
  }
  return best;
}
