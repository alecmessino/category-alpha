#!/usr/bin/env node
/* Parse every shipped JSX module.
 *
 * These files are transformed by Babel IN THE BROWSER — there is no build step, so
 * nothing between an editor and the live URL ever parses them. A single unbalanced
 * brace does not fail a workflow, it renders an empty page at the permanent URL, and
 * the data pipeline keeps committing healthy snapshots underneath it.
 *
 * `node --check` cannot do this: JSX is not JavaScript. So this runs the same parser
 * the browser will, against the same preset, before anything deploys.
 *
 * Run: node scripts/check-jsx.mjs
 */
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* Every directory that ships JSX. The Storm Atlas is here for the same reason docs/app is:
   its sources are transformed by a build rather than by the browser, but an unbalanced brace
   still costs a blank page at a permanent URL, and nothing else between an editor and that URL
   parses them. scripts/test-atlas-build.mjs then proves the committed bundle IS these sources
   compiled -- this proves the sources compile at all. */
const ROOTS = ["docs/app", "docs/storm-atlas/src"].map((d) => join(ROOT, d));

let babel, preset;
try {
  babel = require("@babel/core");
  preset = require.resolve("@babel/preset-react");
} catch {
  /* Loud, not silent. A gate that quietly passes when its own tooling is missing is
     worse than no gate — it reports green for a check it never ran. */
  console.error("[jsx] @babel/core and @babel/preset-react are required for this check.");
  console.error("[jsx] install them in the workflow before this step, or the gate is not a gate.");
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".jsx")) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((d) => {
  const found = walk(d);
  if (!found.length) {
    console.error(`[jsx] no .jsx modules found in ${d.replace(ROOT + "/", "")} — did the layout move?`);
    process.exit(2);
  }
  return found;
});

let bad = 0;
for (const f of files) {
  const label = f.replace(ROOT + "/", "");
  try {
    babel.transformFileSync(f, { presets: [preset], babelrc: false, configFile: false });
    console.log("  ok    " + label);
  } catch (e) {
    bad++;
    console.log("  FAIL  " + label + "\n        " + String(e.message).split("\n").slice(0, 3).join("\n        "));
  }
}
console.log(bad ? `\n${bad} module(s) will not parse in the browser\n` : `\n${files.length} JSX modules parse\n`);
process.exit(bad ? 1 : 0);
