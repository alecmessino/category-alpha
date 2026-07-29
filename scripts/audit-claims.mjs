#!/usr/bin/env node
/* Provenance audit — enforces "every visible claim has exactly one owner".
 *
 * The UI drifted ahead of the code three times, always the same way: a capability
 * statement written as a string literal inside a component, where no feed could
 * contradict it. A hardcoded "Live NHC feed · 200 OK" with no fetch behind it. A
 * pipeline row reading "ensemble consensus" when the only model was climatology.
 * Provenance footers citing "canonical.fix() · v1.2.4" — a file and a version that
 * do not exist.
 *
 * Those are not typos, they are a category of bug, so this is a build step rather
 * than a convention. Capability / liveness / provenance language is allowed to
 * appear ONLY in docs/app/claims.js, where each statement is a function of the real
 * feed result and carries a named owner. Anywhere else it fails the build.
 *
 * Run: node scripts/audit-claims.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dir, "../docs/app");
const ROOT = resolve(__dir, "..");
const OWNER_FILE = "claims.js";      // the one place claims may be authored

/* Each rule is a phrase the UI must not assert on its own authority, plus why. */
const RULES = [
  { re: /\bensemble\s+(consensus|mean|spread|probabilit)/i, why: "no ensemble feed is wired — this exact phrase drifted into the pipeline panel" },
  { re: /\bspaghetti\b/i,                                   why: "no model-track feed is wired" },
  { re: /\b(ASCAT|SFMR)\b/,                                 why: "no scatterometer / SFMR feed is wired" },
  { re: /\brecon\s+(fix|pass|coverage)\b/i,                 why: "no reconnaissance feed is wired" },
  { re: /\b200\s*OK\b/,                                     why: "HTTP status must come from the actual response, never a literal" },
  { re: /\bsha-?256\b/i,                                    why: "hashes are FNV-1a 32-bit; naming a different algorithm misstates the digest" },
  { re: /latency\s*=\s*["']live["']/,                       why: "liveness must be derived from snapshot age, not asserted" },
  { re: /version\s*=\s*["']\d+\.\d+\.\d+["']/,              why: "there is no versioned pipeline; cite the snapshot instead" },
  { re: /\b(canonical\.fix|evidence_quality|verify_stack)\s*(\(\)|\.py)/, why: "names a module that does not exist in this repo" },
  { re: /\breal[- ]?time\b/i,                               why: "the pipeline is ~10-minute batch; 'real-time' overstates it" },
];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (/\.(jsx?|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = (await walk(APP)).concat([resolve(ROOT, "docs/index.html")]);
const findings = [];

for (const f of files) {
  if (f.endsWith(OWNER_FILE)) continue;                 // the registry may say these things
  const text = await readFile(f, "utf8");
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  lines.forEach((line, i) => {
    // Comments explain the rules (and quote the offending phrases); they assert nothing.
    const wasInBlock = inBlock;
    const opens = (line.match(/\/\*/g) || []).length, closes = (line.match(/\*\//g) || []).length;
    if (opens > closes) inBlock = true; else if (closes > opens) inBlock = false;
    if (wasInBlock || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const r of RULES) {
      const m = r.re.exec(line);
      if (m) findings.push({ file: relative(ROOT, f), line: i + 1, match: m[0], why: r.why, text: line.trim().slice(0, 120) });
    }
  });
}

// Every claim id referenced by a component must exist in the registry.
const registry = await readFile(resolve(APP, OWNER_FILE), "utf8");
const defined = new Set([...registry.matchAll(/define\("([^"]+)"/g)].map((m) => m[1])
  .concat([...registry.matchAll(/^\s*"(panel\.[a-z]+)":/gm)].map((m) => m[1])));
const referenced = new Set();
for (const f of files) {
  if (f.endsWith(OWNER_FILE)) continue;
  const text = await readFile(f, "utf8");
  for (const m of text.matchAll(/MTC\.(?:claim|footer)\("([^"]+)"\)/g)) referenced.add(m[1]);
}
for (const id of referenced) {
  if (!defined.has(id)) findings.push({ file: "(reference)", line: 0, match: id, why: "claim id is used by a component but not registered in claims.js", text: id });
}

if (findings.length) {
  console.error("\n[claims] PROVENANCE AUDIT FAILED — " + findings.length + " unowned claim(s):\n");
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  "${f.match}"`);
    console.error(`      ${f.why}`);
    console.error(`      → ${f.text}\n`);
  }
  console.error("  Move the statement into docs/app/claims.js, back it with a real feed result,");
  console.error("  and read it through MTC.claim(id) / MTC.footer(id).\n");
  process.exit(1);
}

console.log(`[claims] provenance audit clean · ${files.length} files · ${defined.size} registered claims · ${referenced.size} referenced`);
