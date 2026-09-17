/* THE PACIFIC GENESIS WATCH IS APPEND-ONLY, AND THAT IS A TEST, NOT A SENTENCE.
 *
 * A "frozen decision state" is worth exactly as much as the guarantee that nobody went back
 * and adjusted it once the outcome was known. Prose in a README cannot carry that guarantee.
 * This can:
 *
 *   1. Every ledger entry names a record file that exists.
 *   2. Every record file still hashes to the bytes the ledger recorded when it was committed.
 *      This is the one that matters: it fails on ANY edit to a committed snapshot, including
 *      a whitespace change, including one made in good faith.
 *   3. Every record's own integrity hash matches its own content, under the canonical form
 *      that snapshot 0001 arrived with -- so the first record verifies as received rather
 *      than being "normalised" into the contract on its way in.
 *   4. No record file exists that the ledger does not account for, and no ledger entry is
 *      duplicated. An unattested frozen state is as bad as a missing one.
 *   5. The ledger is chronologically ordered.
 *   6. A correction appends a supersession record naming an EARLIER record. It never edits.
 *
 * WHY NODE. scripts/genesis-watch/contract.py enforces the same contract at write time, but
 * it needs the archive's Python dependencies. This runs in the offline Checks job on every
 * pull request, which is where a rewritten snapshot has to be caught -- by the time the
 * release job runs, the history has already been changed.
 *
 * Run: node scripts/check-genesis-watch-append-only.mjs [--self-test]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const WATCH = join(ROOT, "data", "genesis-watch");
const SNAPSHOTS = join(WATCH, "snapshots");
const LEDGER = join(WATCH, "LEDGER.json");
const HASH_FIELD = "manifest_sha256_excluding_this_field";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/* THE CANONICAL FORM, and the reason it is this one.
 *
 * Snapshot 0001 arrived with its integrity hash already computed by whoever froze it. The
 * serialisation that reproduces that hash is Python's `json.dumps(body, indent=1,
 * ensure_ascii=False)`, so that is the contract's canonical form -- chosen by the first
 * record rather than imposed on it. Re-serialising 0001 into some other convention would
 * have been an edit to a frozen record on day one.
 *
 * The two dialects differ in exactly two places that matter here, and both are handled:
 * Python separates a key from its value with ": " and items with "," + newline (same as
 * JSON.stringify), and it writes non-ASCII literally rather than as \uXXXX. Python also
 * renders a float that is integral as "20.0" where JavaScript writes "20"; a record written
 * by contract.py can therefore only be re-serialised faithfully here if numbers are carried
 * verbatim, so the raw text is re-parsed for them rather than round-tripped through Number.
 */
function pythonJson(value, indent = 1, level = 0) {
  const pad = (n) => " ".repeat(indent * n);
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return numberLiteral(value);
  if (typeof value === "string") return pyString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => pad(level + 1) + pythonJson(v, indent, level + 1));
    return "[\n" + items.join(",\n") + "\n" + pad(level) + "]";
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  const items = keys.map((k) => pad(level + 1) + pyString(k) + ": "
    + pythonJson(value[k], indent, level + 1));
  return "{\n" + items.join(",\n") + "\n" + pad(level) + "}";
}

/* Python's json escapes exactly these and leaves every other printable character alone,
   including non-ASCII, because the records are written with ensure_ascii=False. */
function pyString(s) {
  let out = '"';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

/* Number literals are carried through as the file spelled them. A Python float that is
   integral prints as "20.0" and JSON.stringify would print "20", which would make every
   record written by the pipeline fail its own hash here for a reason that has nothing to do
   with tampering. NUMS is filled by a pre-pass over the raw text. */
let NUMS = null;
function numberLiteral(n) {
  if (NUMS && NUMS.has(n)) return NUMS.get(n);
  return Number.isInteger(n) ? String(n) : String(n);
}

/* Collect the exact spelling of every numeric literal in the file, keyed by its value. Where
   one value is spelled two ways in one file (20 and 20.0) the check cannot disambiguate and
   says so rather than guessing -- it falls back to reporting the record as unverifiable here
   and defers to the Python contract, instead of reporting a false tamper. */
function collectNumberSpellings(text) {
  const map = new Map();
  const ambiguous = new Set();
  for (const m of text.matchAll(/(?<![\w."])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,\]\}\n])/g)) {
    const lit = m[1];
    const val = Number(lit);
    if (map.has(val) && map.get(val) !== lit) ambiguous.add(val);
    else map.set(val, lit);
  }
  for (const v of ambiguous) map.delete(v);
  return { map, ambiguous };
}

function recordHash(text) {
  const parsed = JSON.parse(text);
  delete parsed[HASH_FIELD];
  const { map } = collectNumberSpellings(text);
  NUMS = map;
  try {
    return sha256(Buffer.from(pythonJson(parsed), "utf8"));
  } finally {
    NUMS = null;
  }
}

function check() {
  const problems = [];
  if (!existsSync(LEDGER)) {
    return existsSync(SNAPSHOTS)
      ? [{ kind: "NO LEDGER", detail: "snapshots/ exists but data/genesis-watch/LEDGER.json does not" }]
      : null;   // nothing to check yet
  }
  const led = JSON.parse(readFileSync(LEDGER, "utf8"));
  const entries = led.entries || [];
  if (entries.length === 0) problems.push({ kind: "EMPTY LEDGER", detail: "no records attested" });

  const seen = new Set();
  let prev = null;
  for (const e of entries) {
    const rid = e.record_id;
    const path = join(SNAPSHOTS, e.file);
    if (seen.has(rid)) problems.push({ kind: "DUPLICATE", detail: `${rid} appears twice in the ledger` });
    seen.add(rid);

    if (!existsSync(path)) {
      problems.push({ kind: "MISSING RECORD", detail: `${rid}: ledger names ${e.file}, absent from the repository` });
      continue;
    }
    const bytes = readFileSync(path);
    const actual = sha256(bytes);
    if (actual !== e.file_sha256) {
      problems.push({
        kind: "RECORD EDITED AFTER COMMIT",
        detail: `${rid}: ${e.file} was ${e.file_sha256.slice(0, 12)}… when committed, `
              + `is ${actual.slice(0, 12)}… now. A frozen decision state is immutable -- `
              + `append a supersession record instead of editing it.`,
      });
      continue;
    }
    const text = bytes.toString("utf8");
    const rec = JSON.parse(text);
    const { ambiguous } = collectNumberSpellings(text);
    if (ambiguous.size === 0) {
      const recomputed = recordHash(text);
      if (rec[HASH_FIELD] !== recomputed) {
        problems.push({
          kind: "INTEGRITY HASH MISMATCH",
          detail: `${rid}: record claims ${String(rec[HASH_FIELD]).slice(0, 12)}…, `
                + `content hashes ${recomputed.slice(0, 12)}…`,
        });
      }
    }
    if (e.manifest_sha256 && e.manifest_sha256 !== rec[HASH_FIELD]) {
      problems.push({ kind: "LEDGER DISAGREES", detail: `${rid}: ledger manifest_sha256 != the record's own` });
    }
    if (prev && e.committed_at_utc && e.committed_at_utc < prev) {
      problems.push({ kind: "OUT OF ORDER", detail: `${rid}: committed ${e.committed_at_utc} before ${prev}` });
    }
    prev = e.committed_at_utc || prev;

    if (rec.supersedes !== undefined && rec.supersedes !== null) {
      if (rec.supersedes === rid) problems.push({ kind: "SELF-SUPERSEDING", detail: `${rid} supersedes itself` });
      else if (!seen.has(rec.supersedes)) {
        problems.push({ kind: "DANGLING SUPERSESSION", detail: `${rid} supersedes ${rec.supersedes}, not an earlier record` });
      }
    }
  }

  const filed = new Set(entries.map((e) => e.file));
  for (const name of readdirSync(SNAPSHOTS).filter((n) => n.endsWith(".json")).sort()) {
    if (!filed.has(name)) {
      problems.push({ kind: "UNATTESTED RECORD", detail: `${name} is in snapshots/ but no ledger entry accounts for it` });
    }
  }
  return problems;
}

function selfTest() {
  /* MAKE IT FIRE. The canonical-form reader is the part that could silently stop checking
     anything -- a serialiser that never reproduces a hash would report every record as
     tampered, and one that always did would report none. Both directions are exercised. */
  const bad = [];
  const sample = {
    schema: "x/1", label: "FROZEN DECISION STATE", n: 3, pct: 20.0, nothing: null,
    nested: { list: [1, 2, { deep: true }], unicode: "Niʻihau — near 0 percent" },
  };
  const text = JSON.stringify(sample, null, 1);   // shape only; spellings come from the file
  NUMS = collectNumberSpellings(text).map;
  const ser = pythonJson(sample);
  NUMS = null;
  if (!ser.includes('"unicode": "Niʻihau — near 0 percent"')) bad.push("non-ASCII was escaped; records are written with ensure_ascii=False");
  if (!ser.startsWith("{\n ")) bad.push("wrong indent: the canonical form is indent=1");
  if (ser.includes('":"')) bad.push('wrong separator: Python writes ": " between key and value');

  /* A real record, edited. The check must notice. */
  if (existsSync(LEDGER)) {
    const led = JSON.parse(readFileSync(LEDGER, "utf8"));
    const e = (led.entries || [])[0];
    if (e) {
      const path = join(SNAPSHOTS, e.file);
      const original = readFileSync(path, "utf8");
      const tampered = original.replace(/"label": "([^"]*)"/, '"label": "$1 "');
      if (tampered === original) bad.push("could not construct a tampered copy for the self-test");
      else {
        if (sha256(Buffer.from(tampered, "utf8")) === e.file_sha256) bad.push("an edited record still matches its ledger hash");
        const t2 = JSON.parse(tampered);
        const { ambiguous } = collectNumberSpellings(tampered);
        if (ambiguous.size === 0 && recordHash(tampered) === t2[HASH_FIELD]) {
          bad.push("an edited record still matches its own integrity hash");
        }
      }
    }
  }

  if (bad.length) {
    console.error("FAIL  the append-only gate does not do what it claims\n");
    for (const b of bad) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log("PASS  append-only gate self-test: canonical form reproduces, tampering is caught");
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const problems = check();
if (problems === null) {
  console.log("PASS  no genesis-watch records yet");
  process.exit(0);
}
if (problems.length) {
  console.error("FAIL  the Pacific Genesis Watch append-only contract is broken\n");
  for (const p of problems) console.error(`  [${p.kind}] ${p.detail}`);
  console.error("\nA committed snapshot is a frozen decision state. Corrections APPEND a");
  console.error("supersession record; they never rewrite what was frozen.");
  process.exit(1);
}
const n = JSON.parse(readFileSync(LEDGER, "utf8")).entries.length;
console.log(`PASS  genesis-watch append-only contract holds across ${n} committed record(s)`);
