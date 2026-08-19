#!/usr/bin/env node
/* Is docs/storm-atlas/dist/ actually what docs/storm-atlas/src/ compiles to?
 *
 * The Atlas ships precompiled output and commits it, which buys a permanent URL that depends on
 * no toolchain at read time and costs the terminal's 3.1 MB in-browser Babel. It invites exactly
 * one failure in return: the committed bundle stops being what the source says. Someone edits
 * dist/ directly to fix something quickly; someone changes a component and forgets to rebuild;
 * a rebase resolves a conflict in the minified file. In every case the source stops being the
 * truth and nothing says so.
 *
 * So this rebuilds from source with the pinned esbuild and byte-compares. Same discipline as
 * scripts/verify-extraction.mjs -- "a pure move that shifts a probability by 1e-16 is not a
 * pure move" -- applied to a bundle rather than an estimator.
 *
 * It fails loudly rather than skipping when esbuild is missing, for the same reason
 * check-jsx.mjs exits 2 in that case.
 *
 * Run: node scripts/test-atlas-build.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "docs/storm-atlas/dist");
const require = createRequire(import.meta.url);

let ESBUILD_VERSION;
try {
  ({ ESBUILD_VERSION } = await import("./build-atlas.mjs"));
  const have = require("esbuild/package.json").version;
  if (have !== ESBUILD_VERSION) {
    console.error(`[atlas-build] esbuild ${have} is installed but the bundle was built with ` +
      `${ESBUILD_VERSION}.`);
    console.error("[atlas-build] output is only byte-reproducible for a pinned version; " +
      "install the pinned one or rebuild and re-pin deliberately.");
    process.exit(2);
  }
} catch (e) {
  if (e && e.code === "MODULE_NOT_FOUND") {
    console.error("[atlas-build] esbuild is required for this check.");
    console.error("[atlas-build] install it in the workflow before this step, or the gate is " +
      "not a gate.");
    process.exit(2);
  }
  throw e;
}

/* Build into a scratch directory so a failing check cannot leave the committed bundle in a
   half-written state. */
const { build } = await import("esbuild");
const { BUILD_OPTIONS } = await import("./build-atlas.mjs");
const { mkdtemp, rm } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const scratch = await mkdtemp(join(tmpdir(), "atlas-build-"));

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

try {
  await build({ ...BUILD_OPTIONS, outdir: scratch });

  const committed = (await readdir(DIST)).filter((f) => f.endsWith(".js")).sort();
  const fresh = (await readdir(scratch)).filter((f) => f.endsWith(".js")).sort();

  console.log(`\n[1] the committed bundle against a rebuild from source`);
  ok("the same set of chunks", committed.join(",") === fresh.join(","),
    `committed [${committed}] | rebuilt [${fresh}]`);

  for (const f of fresh) {
    if (!committed.includes(f)) continue;
    const a = await readFile(join(DIST, f));
    const b = await readFile(join(scratch, f));
    ok(`${f} is byte-identical (${b.length.toLocaleString()} B)`, a.equals(b),
      a.length === b.length
        ? "same length, different bytes -- dist/ has been edited by hand"
        : `committed ${a.length.toLocaleString()} B vs rebuilt ${b.length.toLocaleString()} B ` +
          "-- the source changed and dist/ was not rebuilt");
  }

  console.log(`\n[2] the page loads what the build produces`);
  const raw = await readFile(join(ROOT, "docs/storm-atlas/index.html"), "utf8");
  /* Comments are stripped first. The page explains in a comment WHY it does not load Babel, and
     a naive substring check reads that explanation as the thing it forbids -- the same reason
     audit-claims.mjs skips comment lines before applying its banned phrases. */
  const html = raw.replace(/<!--[\s\S]*?-->/g, "");
  ok("index.html loads dist/atlas.js as a module",
    /<script type="module" src="dist\/atlas\.js"><\/script>/.test(html));
  ok("index.html does not load vendor/babel.js", !/vendor\/babel\.js/.test(html),
    "the whole point of precompiling is that this surface never pays for the transform");
  ok("index.html reuses the shared vendored Leaflet",
    /src="\.\.\/vendor\/leaflet\.js"/.test(html));
  ok("index.html reuses the shared design-system bundle",
    /src="\.\.\/_ds_bundle\.js"/.test(html));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log(failures
  ? `\n${failures} build check(s) failed -- run: node scripts/build-atlas.mjs\n`
  : "\ndist/ is exactly what src/ compiles to\n");
process.exit(failures ? 1 : 0);
