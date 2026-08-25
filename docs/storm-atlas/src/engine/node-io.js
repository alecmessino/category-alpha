/* Reading the pack from disk, for Node.
 *
 * Deliberately NOT in pack.js. A single `import("node:zlib")` anywhere in the browser's module
 * graph makes esbuild resolve a Node builtin for the browser bundle and the build fails -- which
 * is the right failure, but the fix should be structural rather than a rule someone has to keep
 * remembering. So the browser's loader and Node's live in different files and only the DECODER
 * is shared, which is the part that has to agree.
 *
 * Used by scripts/test-atlas-pack.mjs and scripts/test-atlas-parity.mjs. Never by the Atlas.
 */

import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { decodePack } from "./pack.js";
import { Archive } from "./archive.js";
import { Live, LIVE_FILE, LIVE_SCHEMA } from "./live.js";

export async function readPack(path) {
  const raw = gunzipSync(await readFile(path));
  return decodePack(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

/** The whole archive, environment pack included -- the tests need it and the browser does not. */
export async function openArchive(dir) {
  const manifest = JSON.parse(await readFile(`${dir}/atlas-manifest.json`, "utf8"));
  const core = await readPack(`${dir}/atlas-core-v1.bin.gz`);
  const tracks = await readPack(`${dir}/atlas-tracks-v1.bin.gz`);
  const a = new Archive(manifest, core, tracks);
  a.attachEnvironment(await readPack(`${dir}/atlas-env-v1.bin.gz`));
  return a;
}

/** The operational artifact, from disk.
 *
 * The browser's loader is a fetch and lives in live.js; this is the same object built from a
 * file, for the gates. A missing or wrong-schema file produces an UNAVAILABLE layer rather than
 * an exception, exactly as it does in the browser -- the fail-closed path is the one most worth
 * being able to test, so it must be reachable here. */
export async function openLive(dir, { file = LIVE_FILE } = {}) {
  let text;
  try { text = await readFile(`${dir}/${file}`, "utf8"); }
  catch (e) { return new Live(null, `read failed: ${e.message}`); }
  let json;
  try { json = JSON.parse(text); }
  catch (e) { return new Live(null, `parse failed: ${e.message}`); }
  if (!json || json.schema !== LIVE_SCHEMA) {
    return new Live(null, `unexpected schema ${JSON.stringify(json && json.schema)}`);
  }
  return new Live(json, null);
}
