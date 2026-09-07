#!/usr/bin/env node
/* The Millibar → Storm Atlas bridge, both ends.
 *
 * TERMINAL END (docs/app/guidance.jsx, atlasBridgeHref): the link conditions the Atlas on the
 * GENESIS fix and its month, names the storm by ATCF id, and never carries the current position.
 * It is read here as source text, because the terminal has no bundler and the function is a
 * plain JSX module — so the assertion is on the query it writes, reconstructed the same way.
 *
 * ATLAS END (docs/storm-atlas/src/engine/live.js, rowOfAtcfId): the id resolves to exactly one
 * archive row, by uppercased exact match on atcf_id with the season checked, and refuses — null,
 * never a guess — when the pack does not hold it, when the season disagrees, or when two rows
 * claim it. The key is reserved on the surface, so a cohort spec can never take it.
 *
 * Run: node scripts/test-atlas-bridge.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rowOfAtcfId } from "../docs/storm-atlas/src/engine/live.js";
import { RESERVED_QUERY_KEYS, parseQuery, toQuery } from "../docs/storm-atlas/src/engine/cohort.js";

const __dir = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

/* A stub archive with the two accessors the resolver reads. */
function archiveOf(rows) {
  return {
    nStorms: rows.length,
    storms: {
      str: (col, i) => (col === "atcf_id" ? rows[i].atcf_id : null),
      num: (col, i) => (col === "season" ? rows[i].season : null),
    },
  };
}

console.log("\n[1] the Atlas end: rowOfAtcfId");
const A = archiveOf([
  { atcf_id: "EP121984", season: 1984 },     // the OTHER Lala — same name, different storm
  { atcf_id: "CP012026", season: 2026 },
  { atcf_id: null, season: 1902 },           // most of the archive: no ATCF id
  { atcf_id: "EP132026", season: 2026 },
  { atcf_id: "AL052025", season: 2024 },     // a season mismatch — refused
  { atcf_id: "ep112026", season: 2026 },     // lower-case in the pack: still one storm
]);
eq("resolves by exact id", rowOfAtcfId(A, "EP132026"), 3);
eq("case-insensitive on both sides", rowOfAtcfId(A, "ep112026"), 5);
eq("an id the pack does not hold is null, not row 0", rowOfAtcfId(A, "EP992026"), null);
eq("a season mismatch between the id and the row is refused", rowOfAtcfId(A, "AL052025"), null);
eq("a name is not an id", rowOfAtcfId(A, "LALA"), null);
eq("garbage is not an id", rowOfAtcfId(A, "EP13"), null);
eq("empty is null", rowOfAtcfId(A, ""), null);
const dup = archiveOf([{ atcf_id: "EP132026", season: 2026 }, { atcf_id: "EP132026", season: 2026 }]);
eq("two rows claiming one id: refused rather than the first", rowOfAtcfId(dup, "EP132026"), null);

console.log("\n[2] the key is a surface key, never a cohort condition");
ck("atcf is reserved", RESERVED_QUERY_KEYS.includes("atcf"));
const q = "v=1&w=10.4,-105.3,500&mo=8&atcf=EP132026";
const spec = parseQuery(q).spec;
eq("the cohort read from the bridge URL is genesis-within-500km in August, and nothing about the storm", [spec.where, spec.months], [{ lat: 10.4, lon: -105.3, radiusKm: 500 }, [8]]);
ck("re-serialising the cohort does not carry atcf", !/atcf/.test(toQuery(spec)));

console.log("\n[3] the terminal end: what the link carries");
const src = readFileSync(resolve(__dir, "../docs/app/guidance.jsx"), "utf8");
const fn = src.slice(src.indexOf("function atlasBridgeHref"), src.indexOf("function AtlasBridge"));
ck("the href is built from S.genesis, not S.center", /S\.genesis/.test(fn) && !/S\.center|centerAt/.test(fn));
ck("radius is 500 km", /,500"/.test(fn) || /\+ ",500"/.test(fn));
ck("the month is the genesis month", /g\.month/.test(fn));
ck("the storm is named by ATCF id under the reserved key", /q\.set\("atcf", S\.id\)/.test(fn));
ck("no genesis, no link — never a link from the current position", /if \(!g \|\| g\.lat == null \|\| g\.lon == null\) return null/.test(fn));
/* Reconstruct the query the function writes for a known storm and read it back with the Atlas's
   own parser: the two ends agree on the shape. */
const S = { id: "EP132026", center: [24, -122.9], genesis: { lat: 10.418, lon: -105.312, month: 8 } };
const qs = new URLSearchParams(); qs.set("v", "1"); qs.set("w", S.genesis.lat.toFixed(3) + "," + S.genesis.lon.toFixed(3) + ",500"); qs.set("mo", String(S.genesis.month)); qs.set("atcf", S.id);
const back = parseQuery(qs.toString()).spec;
eq("the Atlas reads the terminal's w= as the genesis point", back.where, { lat: 10.418, lon: -105.312, radiusKm: 500 });
ck("and that point is not the storm's current position", Math.abs(back.where.lat - S.center[0]) > 1);

console.log(fail ? `\n${fail} bridge check(s) FAILED` : "\nall bridge checks passed");
process.exit(fail ? 1 : 0);
