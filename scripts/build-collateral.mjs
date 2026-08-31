#!/usr/bin/env node
/* Renders the six artifacts from the evidence gate plus the copy file. */
import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { build } from "./lib/collateral-data.mjs";
import { ROOT } from "./lib/atlas-verify.mjs";
import {
  artifactA, artifactB, artifactB1, artifactB2, artifactC, artifactD, sourceManifestDoc,
} from "./lib/collateral-artifacts.mjs";

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
  ["SOURCE-MANIFEST.html", sourceManifestDoc(D)],
];
for (const [name, html] of files) {
  writeFileSync(join(OUT, name), html);
  const missing = (html.match(/COPY SLOT "[^"]+" NOT SUPPLIED/g) || []).length;
  console.log(`${name.padEnd(46)} ${(html.length / 1024).toFixed(0)} KB` +
    (missing ? `   ${missing} COPY SLOT(S) MISSING` : ""));
}
