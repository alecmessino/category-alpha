#!/usr/bin/env node
/* RE-EXPORT NAMED SHEETS, WITHOUT MOVING THE EVIDENCE UNDER THEM.
 *
 * scripts/build-collateral.mjs renders all eight documents from a LIVE build() -- it opens the
 * archive pack and the ten-minute operational ingest as they stand right now. That is the right
 * behaviour for a full rebuild and the wrong behaviour for a copy correction on one sheet, for
 * two reasons that are not stylistic:
 *
 *   1. THE PACK MOVES. The refresh loop rebuilds the archive on main every few minutes. At the
 *      time this script was written the committed collateral cites PACK 134661125525f27a and the
 *      pack on disk was e950423dcbadc263 -- the same 3,959 storms and 224,153 track points, a
 *      different environment count and therefore a different content hash. A full rebuild would
 *      restamp every sheet's masthead, footer and CITE THIS COHORT string. Re-exporting two
 *      sheets against a pack the other six do not cite splits the package's provenance.
 *   2. THE SHEETS NOT NAMED MUST NOT MOVE AT ALL. A rebuild rewrites all eight files. "Re-export
 *      E and B1" has to mean E and B1.
 *
 * So the render reads its evidence from docs/collateral/source-manifest.json -- the committed
 * manifest the whole package was rendered from and the one scripts/check-collateral.mjs gates
 * every printed figure against. Nothing in the manifest is recomputed here, so no cohort number,
 * interval, refusal, cite string, replay URL or pack stamp can move: the only thing that can
 * change is what the renderer and copy.json say about them. Verified at the outset -- rendering
 * the committed manifest through the unmodified renderer reproduced both committed files
 * byte-for-byte.
 *
 * `coast`, `archive` and the per-member track geometry are stripped from the manifest by
 * build-collateral-manifest.mjs. Neither E nor B1 draws a plate, so neither reads them; a sheet
 * that did would fail loudly here rather than render an empty frame, which is why this script
 * refuses any sheet outside the two it knows.
 *
 * Run: node scripts/reexport-collateral.mjs [E] [B1]
 */
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ROOT } from "./lib/atlas-verify.mjs";
import { artifactB1, artifactE } from "./lib/collateral-artifacts.mjs";

const OUT = join(ROOT, "docs/collateral");
const read = (f) => JSON.parse(readFileSync(join(OUT, f), "utf8"));

const M = read("source-manifest.json");
const copy = read("copy.json");
const contractSources = read("contract-sources.json").sources;

/* build() carries byId; the manifest drops it because it is a second reference to the same
   systems. Rebuilt here from the manifest's own array -- not recomputed, re-indexed. */
const D = { ...M, byId: Object.fromEntries(M.systems.map((s) => [s.id, s])) };

const SHEETS = {
  E: ["E-discrete-event-contract-evidence.html", () => artifactE(D, copy, contractSources)],
  B1: ["B1-97L-reinsurance-ils-parametric.html", () => artifactB1(D, copy)],
};

const want = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const keys = want.length ? want : Object.keys(SHEETS);
const unknown = keys.filter((k) => !SHEETS[k]);
if (unknown.length) {
  console.error(`this script re-exports only ${Object.keys(SHEETS).join(", ")}; asked for ${unknown.join(", ")}`);
  console.error("a sheet that draws a plate needs the live build — use scripts/build-collateral.mjs");
  process.exit(2);
}

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
console.log(`manifest PACK ${M.pack.archive_stamp} · METHODOLOGY ${M.pack.methodology_version}`
  + ` · operational ingest ${M.operational.generated_at}`);
for (const k of keys) {
  const [name, render] = SHEETS[k];
  const before = readFileSync(join(OUT, name), "utf8");
  const html = render();
  const missing = (html.match(/COPY SLOT "[^"]+" NOT SUPPLIED/g) || []).length;
  const stale = (html.match(/\{\{[A-Z_]+\}\}/g) || []).length;
  writeFileSync(join(OUT, name), html);
  console.log(`${k.padEnd(3)} ${name.padEnd(46)} ${(html.length / 1024).toFixed(0)} KB`
    + `  ${before === html ? "unchanged" : `changed ${sha(before)} -> ${sha(html)}`}`
    + (missing ? `   ${missing} COPY SLOT(S) MISSING` : "")
    + (stale ? `   ${stale} UNRESOLVED PLACEHOLDER(S)` : ""));
  if (missing || stale) process.exitCode = 1;
}
