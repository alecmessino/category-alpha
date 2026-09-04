/* THE CELL INDEX -- which storms pass through which 2-degree cell, built once and read many times.
 *
 * WHAT IT IS FOR. The plate's Pathway counts are `pathwayDensity` in analogs.js: for each cell,
 * the number of DISTINCT storms of the cohort with at least one fix in it. That function is fast
 * (7.9 ms over the whole archive), it is what the parity harness compares against the archive's
 * own Python, and it is left exactly as it is. What it cannot answer is the INVERSE question the
 * instrument now asks on every hover and every brush: WHICH storms are those, so the plate can
 * lift them and the foot band can print the literal count for the cell under the pointer. Asking
 * that by re-walking 224,153 fixes per mouse move is not affordable; asking it from a table built
 * once is one array slice.
 *
 * THE SEMANTICS ARE THE SAME SEMANTICS, BY CONSTRUCTION. The index uses analogs.js's own
 * cellGrid / cellOf and dedupes a storm within a cell the same way pathwayDensity does (a stamp
 * per cell); scripts/test-atlas-cells.mjs asserts that for every cell and every cohort the count
 * of index members in the cohort equals pathwayDensity's count, and that a genesis cell holds
 * exactly one entry per storm. No kernel, no neighbourhood, no interpolation: a storm is in a
 * cell if a fix is in it, and nowhere else.
 *
 * LAZY. Building it walks every fix once (measured at ~12 ms) and the resting plate does not need
 * it -- the density surface comes from pathwayDensity -- so it is built on the first inspection
 * and cached per archive. */

import { cellGrid, cellOf, fmt1 } from "./analogs.js";
import { wrap180 } from "./geo.js";

const CACHE = new WeakMap();

/**
 * The compressed-sparse index: for cell c, the storm rows are `order[starts[c] .. starts[c+1])`.
 * Each storm appears at most once per cell.
 */
export function cellIndex(archive, step = 2.0) {
  let byStep = CACHE.get(archive);
  if (!byStep) { byStep = new Map(); CACHE.set(archive, byStep); }
  const hit = byStep.get(step);
  if (hit) return hit;
  const index = buildCellIndex(archive, step);
  byStep.set(step, index);
  return index;
}

/** The build itself, uncached -- what the bench times. */
export function buildCellIndex(archive, step = 2.0) {
  const g = cellGrid(step);
  const { ptLat, ptLon, nStorms } = archive;
  /* Pass one: how many (cell, storm) pairs each cell holds, deduped by stamping the cell with the
     storm's row -- the same one-read-one-compare dedupe pathwayDensity uses. */
  const counts = new Int32Array(g.cells);
  const stamp = new Int32Array(g.cells).fill(-1);
  let pairs = 0;
  for (let row = 0; row < nStorms; row++) {
    const [a, b] = archive.trackRange(row);
    for (let k = a; k < b; k++) {
      const c = cellOf(g, ptLat[k] / 100, wrap180(ptLon[k] / 100), step);
      if (stamp[c] === row) continue;
      stamp[c] = row;
      counts[c]++;
      pairs++;
    }
  }
  const starts = new Uint32Array(g.cells + 1);
  for (let c = 0; c < g.cells; c++) starts[c + 1] = starts[c] + counts[c];
  /* Pass two: place each row, in row order within its cell, so a slice is sorted. */
  const order = new Uint32Array(pairs);
  const fill = new Uint32Array(g.cells);
  stamp.fill(-1);
  for (let row = 0; row < nStorms; row++) {
    const [a, b] = archive.trackRange(row);
    for (let k = a; k < b; k++) {
      const c = cellOf(g, ptLat[k] / 100, wrap180(ptLon[k] / 100), step);
      if (stamp[c] === row) continue;
      stamp[c] = row;
      order[starts[c] + fill[c]++] = row;
    }
  }
  return { step, grid: g, starts, order, pairs, nStorms };
}

/** The cell a position falls in, as the grid's own cell number. */
export function cellAt(index, lat, lon) {
  return cellOf(index.grid, lat, wrap180(lon), index.step);
}

/** The "lat,lon" key pathwayDensity / genesisDensity emit for a cell number, so the two agree. */
export function keyOfCell(index, cell) {
  const g = index.grid;
  const cy = ((cell / g.cols) | 0) - g.oy;
  const cx = (cell % g.cols) - g.ox;
  return `${fmt1(cy * index.step)},${fmt1(cx * index.step)}`;
}

/** The south-west corner of a cell, in degrees. */
export function cornerOfCell(index, cell) {
  const g = index.grid;
  return { lat: (((cell / g.cols) | 0) - g.oy) * index.step, lon: ((cell % g.cols) - g.ox) * index.step };
}

/** A Uint8Array membership mask over storm rows, from a cohort's rows. */
export function maskOf(nStorms, rows) {
  const m = new Uint8Array(nStorms);
  if (rows) for (let i = 0; i < rows.length; i++) m[rows[i]] = 1;
  return m;
}

/**
 * The storms of a cohort that pass through one cell -- the literal, auditable membership behind
 * the cell's Pathway count. `mask` is maskOf(cohort rows); with no mask, the whole archive.
 */
export function pathwayMembers(index, cell, mask = null) {
  const out = [];
  for (let i = index.starts[cell]; i < index.starts[cell + 1]; i++) {
    const row = index.order[i];
    if (!mask || mask[row]) out.push(row);
  }
  return out;
}

/** The storms of a cohort whose GENESIS falls in one cell: exactly one contribution per storm. */
export function genesisMembers(archive, index, cell, rows) {
  const out = [];
  const glat = archive.genesisLat;
  const glon = archive.genesisLon;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const la = glat[row];
    if (Number.isNaN(la)) continue;
    if (cellAt(index, la, glon[row]) === cell) out.push(row);
  }
  return out;
}

/**
 * THE BRUSH. Every storm of the cohort with at least one fix in any cell whose corner lies inside
 * the rectangle -- a union of cell memberships, deduped by row, sorted. It is an INSPECTION: it
 * publishes nothing, computes no rate, and the rectangle is never a condition of the cohort.
 * @returns {{rows: Uint32Array, cells: number}}
 */
export function brushMembers(index, mask, { south, north, west, east }) {
  const g = index.grid;
  const step = index.step;
  const seen = new Uint8Array(index.nStorms);
  const out = [];
  let cells = 0;
  const cy0 = Math.floor(Math.min(south, north) / step);
  const cy1 = Math.floor(Math.max(south, north) / step);
  const cx0 = Math.floor(Math.min(west, east) / step);
  const cx1 = Math.floor(Math.max(west, east) / step);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const cell = (cy + g.oy) * g.cols + (cx + g.ox);
      if (cell < 0 || cell >= g.cells) continue;
      cells++;
      for (let i = index.starts[cell]; i < index.starts[cell + 1]; i++) {
        const row = index.order[i];
        if (seen[row] || (mask && !mask[row])) continue;
        seen[row] = 1;
        out.push(row);
      }
    }
  }
  out.sort((a, b) => a - b);
  return { rows: Uint32Array.from(out), cells };
}
