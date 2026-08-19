#!/usr/bin/env node
/* Build the Storm Atlas bundle.
 *
 * The terminal transforms its JSX in the browser, which costs 3.1 MB of @babel/standalone and a
 * main-thread compile on every page load. That is a defensible trade for a surface with no
 * build step; it is not one for a surface whose whole claim is that it stays fast while holding
 * 224,153 track points in memory. So the Atlas ships PRECOMPILED, the way _ds_bundle.js already
 * does -- the precedent for committed, pre-transformed output is in this repo.
 *
 * WHY COMMITTED OUTPUT IS SAFE HERE. Committing build output invites exactly one failure:
 * someone edits dist/ and the source stops being the truth. scripts/test-atlas-build.mjs closes
 * that by re-running this build in CI and byte-comparing the result. A hand-edited bundle, or a
 * source change nobody rebuilt, fails the pull request. The permanent URL keeps serving static
 * files that depend on no toolchain at read time, which is the property the repo actually cares
 * about.
 *
 * React is bundled from npm and tree-shaken, in its production build -- about 140 KB against
 * the 1.19 MB of development React the terminal loads. Leaflet stays external as `window.L`, so
 * the Atlas and the terminal share one cached copy of it.
 *
 * Run: node scripts/build-atlas.mjs [--check]
 */
import { build } from "esbuild";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "docs/storm-atlas/src");
const OUT = join(ROOT, "docs/storm-atlas/dist");

/* Pinned exactly. esbuild's output is deterministic for a given version, and that determinism
   is what makes the identity gate meaningful -- a floating version would fail the byte compare
   on an unrelated upgrade and teach everyone to ignore it. */
export const ESBUILD_VERSION = "0.25.10";

export const BUILD_OPTIONS = {
  entryPoints: [join(SRC, "main.jsx")],
  outdir: OUT,
  bundle: true,
  splitting: true,
  format: "esm",
  target: ["es2022"],
  platform: "browser",
  minify: true,
  treeShaking: true,
  legalComments: "none",
  sourcemap: false,
  // Deterministic names: a content hash would churn index.html on every rebuild.
  entryNames: "atlas",
  chunkNames: "chunk-[hash]",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  // Leaflet is a global provided by ../vendor/leaflet.js and shared with the terminal.
  external: [],
  metafile: true,
};

export async function runBuild({ clean = true } = {}) {
  if (clean) await rm(OUT, { recursive: true, force: true });
  const result = await build(BUILD_OPTIONS);
  return result;
}

export async function snapshotDist() {
  const files = {};
  for (const f of (await readdir(OUT)).sort()) {
    files[f] = await readFile(join(OUT, f));
  }
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await runBuild();
  const outputs = Object.entries(r.metafile.outputs).sort();
  let total = 0;
  for (const [name, o] of outputs) {
    total += o.bytes;
    console.log(`  ${name.replace("docs/storm-atlas/dist/", "").padEnd(28)} ${o.bytes.toLocaleString().padStart(9)} B`);
  }
  console.log(`  ${"total".padEnd(28)} ${total.toLocaleString().padStart(9)} B ` +
    `(${outputs.length} chunk${outputs.length === 1 ? "" : "s"})`);
}
