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
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/app");

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

const files = readdirSync(APP).filter((f) => f.endsWith(".jsx")).sort();
if (!files.length) { console.error("[jsx] no .jsx modules found in docs/app — did the layout move?"); process.exit(2); }

let bad = 0;
for (const f of files) {
  try {
    babel.transformFileSync(join(APP, f), { presets: [preset], babelrc: false, configFile: false });
    console.log("  ok    " + f);
  } catch (e) {
    bad++;
    console.log("  FAIL  " + f + "\n        " + String(e.message).split("\n").slice(0, 3).join("\n        "));
  }
}
console.log(bad ? `\n${bad} module(s) will not parse in the browser\n` : `\n${files.length} JSX modules parse\n`);
process.exit(bad ? 1 : 0);
