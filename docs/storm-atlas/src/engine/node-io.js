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
