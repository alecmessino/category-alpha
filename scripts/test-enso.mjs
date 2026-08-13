/* Offline unit test for the L3 (ENSO) layer.
   Network is blocked in this sandbox, so the CPC/PSL responses are stubbed with
   fixtures in the two real file formats. Climatology is the REAL committed
   HURDAT2 output from docs/data/latest.json. */
import { readFileSync } from "node:fs";
import { parseOniAscii, parseOniPsl, buildOni, phaseOf, posteriorFor } from "./fetch-data.mjs";

const SEAS = ["DJF","JFM","FMA","MAM","AMJ","MJJ","JJA","JAS","ASO","SON","OND","NDJ"];

// ---- fixtures: 1950..2026, deterministic pseudo-ONI (format test, not truth) ----
function fixtureRows() {
  const rows = [];
  for (let y = 1950; y <= 2026; y++) {
    for (let m = 0; m < 12; m++) {
      if (y === 2026 && m > 5) continue;           // file lags: latest = MJJ 2026
      const v = Math.round((Math.sin((y * 12 + m) / 7.3) * 1.6) * 100) / 100;
      rows.push({ seas: SEAS[m], year: y, anom: v });
    }
  }
  return rows;
}
const rows = fixtureRows();
const ascii = " SEAS YR  TOTAL ANOM\n" +
  rows.map(r => `  ${r.seas} ${r.year} ${(26 + r.anom).toFixed(2)} ${r.anom >= 0 ? " " : ""}${r.anom.toFixed(2)}`).join("\n") + "\n";
const psl = (() => {
  const byY = new Map();
  rows.forEach(r => { if (!byY.has(r.year)) byY.set(r.year, Array(12).fill(-99.9)); byY.get(r.year)[SEAS.indexOf(r.seas)] = r.anom; });
  let out = "  1950 2026\n";
  for (const [y, arr] of byY) out += `  ${y} ` + arr.map(v => v.toFixed(2).padStart(7)).join("") + "\n";
  return out + "  -99.9\n  ONI from CPC\n";
})();

let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)); };
const ck = (name, cond, detail = "") => { if (!cond) fail++; console.log((cond ? "  ok   " : "  FAIL ") + name + (detail ? "  " + detail : "")); };

console.log("\n[1] parsers agree across both real file formats");
const a = parseOniAscii(ascii), p = parseOniPsl(psl);
eq("ascii row count", a.length, rows.length);
eq("psl row count", p.length, rows.length);
const key = r => `${r.year}-${r.seas}`;
const am = new Map(a.map(r => [key(r), r.anom])), pm = new Map(p.map(r => [key(r), r.anom]));
ck("every ASO value matches between sources",
   [...am].every(([k, v]) => Math.abs(pm.get(k) - v) < 1e-9), `${am.size} keys`);
eq("ASO 2015 lands in the ASO slot (col 9 of PSL)", pm.get("2015-ASO"), am.get("2015-ASO"));

console.log("\n[2] junk lines are rejected, not silently parsed");
eq("header-only file yields nothing", parseOniAscii("SEAS YR TOTAL ANOM\nnonsense here\n").length, 0);
eq("psl ignores the -99.9 sentinel row", parseOniPsl("  1950 1950\n  1950" + "  -99.90".repeat(12) + "\n").length, 0);

console.log("\n[3] phase thresholds are CPC's, and boundaries are inclusive");
eq("+0.50 is El Nino", phaseOf(0.5), "el");
eq("+0.49 is neutral", phaseOf(0.49), "neutral");
eq("-0.50 is La Nina", phaseOf(-0.5), "la");
eq("missing is null", phaseOf(null), null);

console.log("\n[4] anchor selection + the persistence assumption");
const oni = buildOni(parseOniAscii(ascii), "fixture", 200, 5);
ck("current-year ASO absent in July, so a prior season is carried forward", oni.assumed === true);
ck("anchor is the newest observed season", oni.anchorSeas === "MJJ" && oni.anchorYear === 2026,
   `${oni.anchorSeas} ${oni.anchorYear}`);
ck("anchor age reported in months", oni.ageMonths >= 0 && oni.ageMonths < 24, `${oni.ageMonths}mo`);
const withPeak = buildOni(parseOniAscii(ascii + "  ASO 2026 27.50  1.10\n"), "fixture", 200, 5);
ck("once ASO exists it wins and the assumption clears",
   withPeak.assumed === false && withPeak.anchorSeas === "ASO" && withPeak.anchorYear === 2026);

console.log("\n[5] stratification over the REAL committed HURDAT2 climatology");
const latest = JSON.parse(readFileSync(new URL("../docs/data/latest.json", import.meta.url), "utf8"));
const c = latest.feeds.climatology;
ck("real climatology present", !!(c && c.ok), c && c.source);
const clim = {
  years: c.years, from: c.years[0], to: c.years[c.years.length - 1],
  hurricanes: c.hurricanesPerSeason, major: c.majorPerSeason,
  hurricanesAfter: () => c.hurricanesPerSeason, majorAfter: () => c.majorPerSeason,
};
const post = posteriorFor(false, 7, clim, null, oni);
const L = Object.fromEntries(post.layers.map(l => [l.id, l]));
ck("L0 base present", typeof L.base.p === "number", `${Math.round(L.base.p * 100)}%`);
ck("L2 still honestly declared unavailable", L.std.unavailable === true);
const matched = clim.years.filter(y => phaseOf(oni.asoByYear.get(y)) === oni.phase).length;
console.log(`       phase=${oni.phase}  matched seasons=${matched}/${clim.years.length}`);
if (matched >= 6) {
  ck("L3 produced a number", typeof L.enso.p === "number", `${Math.round(L.enso.p * 100)}%`);
  ck("L3 lies between the raw stratified rate and the unstratified anchor (shrinkage)", (() => {
    const raw = Number(/→ (\d+)% raw/.exec(L.enso.basis)[1]) / 100;
    const anchor = L.doy && L.doy.p != null ? L.doy.p : L.base.p;
    return L.enso.p >= Math.min(raw, anchor) - 1e-9 && L.enso.p <= Math.max(raw, anchor) + 1e-9;
  })());
  /* The governing layer is the LAST available one, not L3 specifically. L4 — the ONI
     similarity weighting — was added because the phase bucket cannot tell a marginal
     El Nino from a strong one, and it takes precedence when it clears its own floor. */
  const governing = post.layers.filter((l) => !l.unavailable && l.p != null).slice(-1)[0];
  ck("posterior adopts the last available layer", Math.abs(post.p - governing.p) < 1e-12,
     `posterior=${post.p.toFixed(4)} governing=${governing.id}@${governing.p.toFixed(4)}`);
  ck("and that layer is the ONI-similarity one when it is available",
     governing.id === "onisim" || L.onisim.unavailable,
     `governing=${governing.id} onisimAvailable=${!L.onisim.unavailable}`);
  if (!L.onisim.unavailable) {
    ck("L4 publishes an effective sample size, not a raw count",
       /effective [\d.]+ seasons/.test(L.onisim.basis), L.onisim.basis);
    ck("L4 is shrunk toward the unstratified estimate like L3 is",
       /shrunk \d+% toward/.test(L.onisim.basis));
    ck("L4 and L3 answer the same question, so they should be within 25 points",
       Math.abs(L.onisim.p - L.enso.p) < 0.25,
       `L3=${(L.enso.p * 100).toFixed(0)}% L4=${(L.onisim.p * 100).toFixed(0)}%`);
  }
  ck("basis discloses sample size + shrinkage", /season/.test(L.enso.basis) && /shrunk/.test(L.enso.basis));
  ck("basis discloses the persistence assumption", /persistence assumed/.test(L.enso.basis), L.enso.basis);
} else {
  ck("thin bucket refused rather than published", L.enso.unavailable === true, L.enso.basis);
}

console.log("\n[6] degradation paths");
const noOni = posteriorFor(false, 7, clim, null, null);
ck("no ONI → L3 NO FEED, stack still returns", noOni.layers.find(l => l.id === "enso").unavailable === true && typeof noOni.p === "number");
const thin = buildOni(parseOniAscii(ascii), "fixture", 200, 5);
thin.asoByYear = new Map([[2000, 2.4]]);   // one lone matching season
const thinPost = posteriorFor(false, 7, clim, null, thin);
const tl = thinPost.layers.find(l => l.id === "enso");
ck("thin phase bucket refused", tl.unavailable === true, tl.basis);
ck("posterior falls back to L1/L0 unchanged", Math.abs(thinPost.p - noOni.p) < 1e-12);

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nall assertions passed\n");
process.exit(fail ? 1 : 0);
