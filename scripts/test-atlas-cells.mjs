#!/usr/bin/env node
/* Do the plate's cell counts mean what the labels say?
 *
 * PATHWAY COUNTS: pathway[cell] = |{ storm : storm has >= 1 fix in cell }|, deduped by storm.
 * GENESIS COUNTS: genesis[cell] = |{ storm : genesis in cell }|, exactly one per storm.
 * No kernel, no interpolation, no neighbourhood spreading; pow(c/max) is display intensity only
 * and the underlying counts stay literal and auditable.
 *
 * Three things are asserted, against the REAL archive rather than a fixture, for the whole record
 * and for a conditioned cohort:
 *   1. pathwayDensity and genesisDensity equal a brute-force Set-of-storms count per cell.
 *   2. The cached cell index (engine/cells.js), which the hover readout and the brush read, agrees
 *      with pathwayDensity for every cell and every cohort -- the index is a second path to the
 *      same number, and a second path that drifts is how a readout stops being literal.
 *   3. The renderer draws one rectangle per counted cell and nothing else: no smoothing term in
 *      the layer, and the alpha function is monotonic in the count.
 *
 * Run: node scripts/test-atlas-cells.mjs
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { filterStorms } from "../docs/storm-atlas/src/engine/query.js";
import { cellGrid, cellOf, fmt1, genesisDensity, pathwayDensity }
  from "../docs/storm-atlas/src/engine/analogs.js";
import { brushMembers, cellIndex, genesisMembers, keyOfCell, maskOf, pathwayMembers }
  from "../docs/storm-atlas/src/engine/cells.js";
import { wrap180 } from "../docs/storm-atlas/src/engine/geo.js";
import { ROOT } from "./lib/atlas-verify.mjs";

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

const A = await openArchive(join(ROOT, "docs/storm-atlas/data"));
const STEP = 2.0;
const g = cellGrid(STEP);
const keyOf = (cell) => {
  const cy = ((cell / g.cols) | 0) - g.oy;
  const cx = (cell % g.cols) - g.ox;
  return `${fmt1(cy * STEP)},${fmt1(cx * STEP)}`;
};

/* Brute force: a Set of storm rows per cell key, built with nothing shared with the engine but
   the cell convention itself. */
function bruteForce(rows) {
  const path = new Map();
  const gen = new Map();
  for (const row of rows) {
    const [a, b] = A.trackRange(row);
    for (let k = a; k < b; k++) {
      const key = keyOf(cellOf(g, A.ptLat[k] / 100, wrap180(A.ptLon[k] / 100), STEP));
      if (!path.has(key)) path.set(key, new Set());
      path.get(key).add(row);
    }
    const la = A.genesisLat[row];
    if (!Number.isNaN(la)) {
      const key = keyOf(cellOf(g, la, wrap180(A.genesisLon[row]), STEP));
      gen.set(key, (gen.get(key) || 0) + 1);
    }
  }
  return { path, gen };
}

const sameCounts = (density, brute, sizeOf) => {
  if (density.size !== brute.size) return `cell count ${density.size} vs ${brute.size}`;
  for (const [key, n] of density) {
    const b = brute.get(key);
    if (b === undefined) return `cell ${key} counted but not in the brute force`;
    if (sizeOf(b) !== n) return `cell ${key}: engine ${n}, brute force ${sizeOf(b)}`;
  }
  return null;
};

const COHORTS = [
  ["the whole archive", {}],
  ["a conditioned cohort (12N 105W, 800 km, since 1971)",
    { lat: 12, lon: -105, radiusKm: 800, seasonFrom: 1971 }],
  ["an outcome-conditioned cohort (Cat 4+)", { intensity: "cat4" }],
];

const index = cellIndex(A, STEP);
console.log(`\n[cells] index: ${index.pairs.toLocaleString()} (cell, storm) pairs over ${A.nStorms.toLocaleString()} storms`);

for (const [name, filters] of COHORTS) {
  console.log(`\n[cells] ${name}`);
  const rows = filterStorms(A, filters).rows;
  const cases = Array.from(rows, (r) => ({ row: r }));
  const path = pathwayDensity(A, cases, STEP);
  const gen = genesisDensity(A, rows, STEP);
  const brute = bruteForce(rows);

  let bad = sameCounts(path, brute.path, (s) => s.size);
  ok(`pathway counts equal |{storm : >=1 fix in cell}| for all ${path.size} cells`, !bad, bad || "");
  bad = sameCounts(gen, brute.gen, (n) => n);
  ok(`genesis counts equal |{storm : genesis in cell}| for all ${gen.size} cells`, !bad, bad || "");

  /* Exactly one genesis contribution per storm that has a genesis. */
  let genTotal = 0;
  for (const n of gen.values()) genTotal += n;
  let withGenesis = 0;
  for (const r of rows) if (!Number.isNaN(A.genesisLat[r])) withGenesis++;
  ok(`genesis contributions sum to the storms with a genesis (${withGenesis.toLocaleString()})`,
    genTotal === withGenesis, `${genTotal}`);

  /* A storm is counted once per cell it touches -- never once per fix. Summing the pathway grid
     therefore equals the sum over storms of the distinct cells each one crosses. */
  let pathTotal = 0;
  for (const n of path.values()) pathTotal += n;
  let distinctCells = 0;
  let fixes = 0;
  for (const s of brute.path.values()) distinctCells += s.size;
  for (const r of rows) { const [a, b] = A.trackRange(r); fixes += b - a; }
  ok(`pathway grid sums to distinct (storm, cell) pairs (${distinctCells.toLocaleString()}), not to fixes (${fixes.toLocaleString()})`,
    pathTotal === distinctCells && pathTotal < fixes);

  /* The index agrees with pathwayDensity for EVERY cell, in both directions. */
  const mask = maskOf(A.nStorms, rows);
  let disagree = 0;
  /* Walk every cell of the grid rather than only the counted ones, so a cell the index counts and
     the density does not is caught too. */
  let indexed = 0;
  for (let cell = 0; cell < g.cells; cell++) {
    const members = pathwayMembers(index, cell, mask);
    const n = path.get(keyOfCell(index, cell)) || 0;
    if (members.length !== n) disagree++;
    if (members.length) indexed++;
    /* And each member really does have a fix in that cell. */
    if (members.length && disagree === 0) {
      const row = members[0];
      const [a, b] = A.trackRange(row);
      let hit = false;
      for (let k = a; k < b && !hit; k++) {
        if (cellOf(g, A.ptLat[k] / 100, wrap180(A.ptLon[k] / 100), STEP) === cell) hit = true;
      }
      if (!hit) disagree++;
    }
  }
  ok(`the cell index reproduces pathwayDensity in every one of ${g.cells.toLocaleString()} grid cells (${indexed} occupied)`,
    disagree === 0, `${disagree} cells disagree`);

  /* Genesis members through the index agree with genesisDensity. */
  let genBad = 0;
  for (const [key, n] of gen) {
    const [la, lo] = key.split(",").map(Number);
    const cell = cellOf(g, la + STEP / 2, lo + STEP / 2, STEP);
    if (genesisMembers(A, index, cell, rows).length !== n) genBad++;
  }
  ok("genesis membership through the index agrees with genesisDensity", genBad === 0, `${genBad} cells`);

  /* The brush is a union of cells, deduped by storm: never more than the cohort, and for the
     whole world exactly the storms that have any fix at all. */
  const world = brushMembers(index, mask, { south: -90, north: 90, west: -180, east: 180 });
  let withTrack = 0;
  for (const r of rows) { const [a, b] = A.trackRange(r); if (b > a) withTrack++; }
  ok(`a world-wide brush lifts exactly the cohort's storms with a track (${withTrack.toLocaleString()})`,
    world.rows.length === withTrack, `${world.rows.length}`);
  const gulf = brushMembers(index, mask, { south: 18, north: 30, west: -98, east: -80 });
  let gulfBrute = 0;
  for (const r of rows) {
    const [a, b] = A.trackRange(r);
    let hit = false;
    for (let k = a; k < b && !hit; k++) {
      const c = cellOf(g, A.ptLat[k] / 100, wrap180(A.ptLon[k] / 100), STEP);
      const cy = ((c / g.cols) | 0) - g.oy;
      const cx = (c % g.cols) - g.ox;
      if (cy >= 9 && cy <= 15 && cx >= -49 && cx <= -40) hit = true;
    }
    if (hit) gulfBrute++;
  }
  ok(`a Gulf brush (18-30N, 98-80W) lifts the storms with a fix in those cells (${gulfBrute.toLocaleString()})`,
    gulf.rows.length === gulfBrute, `${gulf.rows.length}`);
}

console.log("\n[cells] the renderer draws literal counts and nothing else");
{
  const layer = await readFile(join(ROOT, "docs/storm-atlas/src/render/pathway-layer.js"), "utf8");
  const code = layer.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("no smoothing, kernel, blur or interpolation term in the pathway layer",
    !/\b(blur|gaussian|kernel|smooth|interpolat|neighbou?r|dilat|convol)/i.test(code));
  ok("one fillRect per counted cell, from the density Map, with no neighbour reads",
    /for \(const \[key, n\] of d\)/.test(code) && /fillRect/.test(code) && !/d\.get\(/.test(code));
  /* alpha = floor + span * (n/peak)^gamma is monotonic in n for gamma > 0, so a cell with more
     storms is never fainter than one with fewer -- the ordering the eye reads is the ordering of
     the counts. */
  const gamma = Number((code.match(/alphaGamma:\s*([0-9.]+)/) || [])[1]);
  ok("display intensity is a monotonic power of the literal count", gamma > 0 && gamma <= 1, `gamma ${gamma}`);
}

console.log(failures === 0
  ? "\nevery cell count is a literal, deduped count of storms, and the index says the same"
  : `\n${failures} cell check(s) failed`);
process.exit(failures ? 1 : 0);
