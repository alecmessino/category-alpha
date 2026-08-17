#!/usr/bin/env node
/* Tests for the outlook shapefile reader.
 *
 * This is what puts formation areas on the map. Get the shp/dbf pairing wrong and a 50%
 * probability gets drawn over the wrong ocean — a failure that looks completely normal.
 *
 * Run: node scripts/test-shapefile.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipEntries, parsePolygons, parseDbf, parseOutlookShapes, attachShapes } from "./lib/shapefile.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ZIP = readFileSync(resolve(__dir, "fixtures/gtwo_shapefiles.zip"));

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

console.log("\n[1] the zip opens without an unzip binary");
const files = unzipEntries(ZIP);
ck("entries are found", Object.keys(files).length > 0, String(Object.keys(files).length));
ck("the areas layer is present", Object.keys(files).some((n) => /areas.*\.shp$/.test(n)));
ck("and its attribute table", Object.keys(files).some((n) => /areas.*\.dbf$/.test(n)));
ck("deflate actually inflated", (files[Object.keys(files).find((n) => /areas.*\.shp$/.test(n))] || []).length > 9000);
/* Garbage in must not throw — this runs inside the refresh job. */
eq("a non-zip yields nothing", Object.keys(unzipEntries(Buffer.from("not a zip at all"))).length, 0);
eq("an empty buffer yields nothing", Object.keys(unzipEntries(Buffer.alloc(0))).length, 0);
eq("null yields nothing", Object.keys(unzipEntries(null)).length, 0);

console.log("\n[2] polygons parse to [lat, lon] rings");
const shp = files[Object.keys(files).find((n) => /areas.*\.shp$/.test(n))];
const polys = parsePolygons(shp);
eq("two areas in this bundle", polys.length, 2);
ck("each is a single ring", polys.every((p) => p.rings.length === 1));
ck("each ring is closed-ish and dense", polys.every((p) => p.rings[0].length > 100));
/* THE ORDER THAT MATTERS. Latitude first. A transposed pair puts a Pacific area in Antarctica
   and still renders, so assert the actual hemisphere. */
const all = polys.flatMap((p) => p.rings[0]);
ck("every latitude is tropical north", all.every(([la]) => la > 0 && la < 40), "lat range");
ck("every longitude is eastern Pacific", all.every(([, lo]) => lo < -90 && lo > -180), "lon range");
eq("no polygons from an empty buffer", parsePolygons(Buffer.alloc(0)).length, 0);

console.log("\n[3] the attribute table reads");
const dbf = parseDbf(files[Object.keys(files).find((n) => /areas.*\.dbf$/.test(n))]);
eq("two rows", dbf.length, 2);
eq("basin", dbf.map((r) => r.BASIN), ["Pacific", "Pacific"]);
eq("area numbers", dbf.map((r) => r.AREA), ["1", "2"]);
eq("7-day probability as published", dbf.map((r) => r.PROB7DAY), ["50%", "50%"]);
eq("an empty buffer yields no rows", parseDbf(Buffer.alloc(0)).length, 0);

console.log("\n[4] the joined product");
const P = parseOutlookShapes(ZIP);
eq("two areas", P.areas.length, 2);
eq("percentages are numbers, not strings", P.areas.map((a) => a.pct7d), [50, 50]);
eq("48-hour reads zero, not null", P.areas.map((a) => a.pct48), [0, 0]);
eq("basin is lowercased for joining", P.areas.map((a) => a.basin), ["pacific", "pacific"]);
/* Area 2 is the one that matters for Hawaii — it must be the WESTERN blob. */
const a2 = P.areas.find((a) => a.n === 2);
ck("area 2 spans roughly 132W-152W", a2.bbox[0] < -130 && a2.bbox[0] > -160, `xmin=${a2.bbox[0].toFixed(1)}`);
ck("area 1 is the eastern one", P.areas.find((a) => a.n === 1).bbox[2] > -110);

console.log("\n[5] a bundle that does not agree with itself is refused, not guessed");
/* Truncating the dbf drops a row while the shp still has two polygons. Pairing them by index
   would attribute area 2's probability to area 1's blob. */
const bad = Object.assign({}, files);
const dbfKey = Object.keys(files).find((n) => /areas.*\.dbf$/.test(n));
const trunc = Buffer.from(files[dbfKey]);
trunc.writeInt32LE(1, 4);                                     // claim one record instead of two
const forged = forgeZip({ ...bad, [dbfKey]: trunc });
const R = parseOutlookShapes(forged);
eq("no areas returned", R.areas.length, 0);
ck("and it says why", /not self-consistent/.test(R.note), R.note);

console.log("\n[6] joining geometry onto the text outlook");
const text = [
  { basin: "pacific", n: 1, title: "South of Mexico", pct7d: 50 },
  { basin: "pacific", n: 2, title: "Western Portion of the East Pacific", pct7d: 50 },
  { basin: "atlantic", n: 1, title: "Central Tropical Atlantic", pct7d: 30 },
];
const J = attachShapes(text, P.areas);
eq("two of three matched", J.matched, 2);
eq("one unmatched", J.unmatched, 1);
ck("the Atlantic area keeps its text entry", J.areas.find((a) => a.basin === "atlantic").title === "Central Tropical Atlantic");
ck("and is simply not drawn", !J.areas.find((a) => a.basin === "atlantic").rings);
ck("the Pacific areas carry rings", J.areas.filter((a) => a.basin === "pacific").every((a) => a.rings && a.rings[0].length > 100));
/* The text is authoritative for wording and probability; geometry only adds rings. */
eq("text probability is not overwritten", J.areas.map((a) => a.pct7d), [50, 50, 30]);
eq("no shapes means the text passes through untouched", attachShapes(text, []).matched, 0);
eq("no text means nothing is invented", attachShapes([], P.areas).areas.length, 0);

console.log(fail ? `\n${fail} FAILED\n` : "\nall shapefile checks passed\n");
process.exit(fail ? 1 : 0);

/* Rebuild a zip from a name->Buffer map, stored (method 0), so the test can forge an
   inconsistent bundle without shelling out. */
function forgeZip(entries) {
  const locals = [], central = [];
  let off = 0;
  for (const [name, body] of Object.entries(entries)) {
    const nb = Buffer.from(name, "latin1");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(0, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(body.length, 22);
    lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nb, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(0, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(body.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nb);
    off += 30 + nb.length + body.length;
  }
  const lb = Buffer.concat(locals), cb = Buffer.concat(central);
  const eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0);
  eo.writeUInt16LE(Object.keys(entries).length, 8); eo.writeUInt16LE(Object.keys(entries).length, 10);
  eo.writeUInt32LE(cb.length, 12); eo.writeUInt32LE(lb.length, 16);
  return Buffer.concat([lb, cb, eo]);
}
