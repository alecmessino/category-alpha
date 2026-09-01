#!/usr/bin/env node
/* Renders the six artifacts from the evidence gate plus the copy file. */
import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { build } from "./lib/collateral-data.mjs";
import { ROOT } from "./lib/atlas-verify.mjs";
import {
  artifactA, artifactB, artifactB1, artifactB2, artifactC, artifactD, artifactE, sourceManifestDoc,
} from "./lib/collateral-artifacts.mjs";
import { LEGIBILITY_CUTS, PROTECTED } from "./lib/collateral-cuts.mjs";

const OUT = join(ROOT, "docs/collateral");
mkdirSync(OUT, { recursive: true });
const copyPath = join(OUT, "copy.json");
const copy = existsSync(copyPath) ? JSON.parse(readFileSync(copyPath, "utf8")) : {};

const D = await build();
const files = [
  ["A-active-systems-overview.html", artifactA(D, copy)],
  ["B-97L-gulf-event-dossier.html", artifactB(D, copy)],
  ["B1-97L-reinsurance-ils-parametric.html", artifactB1(D, copy)],
  ["B2-97L-energy-weather-trading.html", artifactB2(D, copy)],
  ["C-karina-major-hurricane-analog-brief.html", artifactC(D, copy)],
  ["D-storm-atlas-tear-sheet.html", artifactD(D, copy)],
  ["E-discrete-event-contract-evidence.html", artifactE(D, copy)],
  ["SOURCE-MANIFEST.html", sourceManifestDoc(D)],
];
for (const [name, html] of files) {
  writeFileSync(join(OUT, name), html);
  const missing = (html.match(/COPY SLOT "[^"]+" NOT SUPPLIED/g) || []).length;
  console.log(`${name.padEnd(46)} ${(html.length / 1024).toFixed(0)} KB` +
    (missing ? `   ${missing} COPY SLOT(S) MISSING` : ""));
}

/* THE CUT REGISTER, PUBLISHED WITH THE ARTIFACTS. A block removed to meet the type gate is part
   of the record of what these pages are, so it ships beside them rather than living only in the
   source. scripts/check-collateral.mjs reads the same table. */
writeFileSync(join(OUT, "legibility-cuts.json"), JSON.stringify({
  schema: "storm-atlas-collateral-legibility-cuts/1",
  gate: {
    body_pt: 8.5, detail_pt: 7.5, legal_pt: 7,
    page: "US Letter, 10 mm margin — a 196 x 259 mm content box, 740 x 979 px at 96 dpi",
    rule: "Cut content before shrinking type. Nothing substantive prints below 7.5 pt.",
  },
  protected: PROTECTED,
  cuts: LEGIBILITY_CUTS,
}, null, 2));
console.log(`legibility-cuts.json                           ${
  Object.values(LEGIBILITY_CUTS).reduce((n, a) => n + a.length, 0)} recorded cut(s)`);
