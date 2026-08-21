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
  /* These two used to mean "no such feed is wired". Both are wired now, and that makes
     the rule MORE necessary rather than less: an intermittent feed is exactly the kind
     that a component will describe confidently on a cycle when it delivered nothing. A
     scatterometer pass is an orbit and a recon fix is an aircraft that has to be flying,
     so any sentence about either has to be a function of this cycle's fetch result. The
     instrument names stay banned outside the registry; a panel renders what the pass
     actually reported, from the data. */
  { re: /\b(ASCAT|SFMR)\b/,                                 why: "scatterometer and SFMR winds are intermittent — name them only through a claim backed by this cycle's pass" },
  { re: /\brecon\s+(fix|pass|coverage)\b/i,                 why: "an aircraft fix exists only when one is flying — assert it through a claim backed by the poll result, never as a literal" },
  { re: /\b200\s*OK\b/,                                     why: "HTTP status must come from the actual response, never a literal" },
  /* Scoped, because the premise is scoped. The TERMINAL's evidence hashes are FNV-1a 32-bit,
     so a component naming SHA-256 there misstates what the code computes -- which is what this
     rule caught, twice, and why it exists. The genesis archive is a different codebase whose
     table hashes ARE SHA-256 (scripts/genesis/provenance.py:sha256_file, and every entry in
     data/genesis-archive/MANIFEST.json). Banning the word on the Storm Atlas would force it to
     describe a real digest by a wrong name, which is the opposite of the rule's purpose. The
     exemption is by path and is narrow: no other rule is scoped, and this one still applies
     everywhere the FNV-1a premise holds. */
  { re: /\bsha-?256\b/i,                                    why: "the terminal's hashes are FNV-1a 32-bit; naming a different algorithm misstates the digest",
    exceptIn: ["docs/storm-atlas/"] },
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

/* Every surface that renders a claim.
 *
 * docs/app is the terminal. docs/storm-atlas/src is the Storm Atlas -- its SOURCES, not its
 * committed bundle: dist/ is generated, scripts/test-atlas-build.mjs proves it is exactly
 * these files compiled, and auditing minified output would only report the same findings twice
 * in a form nobody can act on. The two entry documents are added by name because neither lives
 * inside a scanned directory. */
const files = [
  ...(await walk(APP)),
  ...(await walk(resolve(ROOT, "docs/storm-atlas/src"))),
  resolve(ROOT, "docs/index.html"),
  resolve(ROOT, "docs/storm-atlas/index.html"),
];
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
      // A rule whose premise does not hold in this directory does not apply to it.
      if (r.exceptIn && r.exceptIn.some((d) => f.includes(d))) continue;
      const m = r.re.exec(line);
      if (m) findings.push({ file: relative(ROOT, f), line: i + 1, match: m[0], why: r.why, text: line.trim().slice(0, 120) });
    }
  });
}

/* Every claim id referenced by a component must exist in the registry.
   The "?" drawers pass their id as a JSX attribute and read it through a variable, so
   neither end matches the MTC.claim("literal") shape. That made a whole class of text
   invisible here: a mistyped id renders an empty drawer, which looks identical to a
   panel that simply has no caveat — a caveat silently disappearing is the exact failure
   this file exists to prevent. Both ends are matched explicitly. */
const registry = await readFile(resolve(APP, OWNER_FILE), "utf8");
const defined = new Set([...registry.matchAll(/\b(?:define|note)\("([^"]+)"/g)].map((m) => m[1])
  .concat([...registry.matchAll(/^\s*"(panel\.[a-z]+)":/gm)].map((m) => m[1])));

/* EVERY WAY A COMPONENT CAN ASK FOR A CLAIM.
 *
 * `MTC.claim(...)` and `MTC.footer(...)` are the terminal's. `claimText(...)` is the Storm
 * Atlas's -- ui/kit.jsx wraps `MTC.claim(id).text` behind it -- and it was MISSING from this
 * list, which is the whole reason this section is being rewritten rather than extended.
 * Measured: renaming a live id to `atlas.rates_TYPO` left this audit reporting "provenance
 * audit clean" and put the string `UNREGISTERED CLAIM (atlas.rates_TYPO)` on screen, in the
 * block headed WHAT THESE RATES ASSUME -- the sentence that qualifies every rate on the panel.
 *
 * The list is matched by CALL SITE rather than by id, because the failure above was not a
 * mistyped id: it was a new accessor nobody added here. Counting call sites and requiring each
 * one to yield a literal id means the next accessor cannot be added silently either -- it will
 * be seen, and if its argument is not a literal it will be reported rather than skipped.
 *
 * THE LITERAL REQUIREMENT IS SCOPED TO THE ATLAS, AND THE SCOPE IS THE HONEST PART.
 * Every one of the Atlas's call sites passes a literal, so the rule costs it nothing and closes
 * the class permanently. The TERMINAL has two long-standing patterns that are correct and are
 * not literals, and tightening them here would mean either rewriting working code for a gate's
 * convenience or writing an exemption broad enough to hide the next real one:
 *
 *   data-loader.js:260  MTC.claim(id, …) inside a .map() over a table of [stage, id] pairs --
 *                       the ids ARE literals, two lines above, and all eight are registered.
 *   analogs.jsx:33      a local wrapper that reproduces the registry's own fallback for the
 *                       case where window.MTC has not loaded, the same shape ui/kit.jsx uses.
 *
 * So ids referenced anywhere are still checked for existence, exactly as before; only the
 * shape requirement is Atlas-scoped. What the terminal keeps is the residual gap this file
 * cannot close statically -- an id it never sees as a literal -- and for the Atlas that gap is
 * closed from the other end instead: check-atlas-dom asserts the registry's failure sentinels
 * reach no pixel of the rendered surface. */
const STRICT_LITERAL_IDS = "docs/storm-atlas/src";
const ACCESSORS = /\b(claimText|MTC\.claim|MTC\.footer)\s*\(/g;
const referenced = new Set();
let callSites = 0;
for (const f of files) {
  if (f.endsWith(OWNER_FILE)) continue;
  const text = await readFile(f, "utf8");
  const rel = relative(ROOT, f);

  /* Each accessor call, checked where it stands. A claim id that is not a string literal
     cannot be verified from here at all, and a check that quietly skips what it cannot see is
     the failure this file exists to prevent -- so it is reported. */
  const strict = rel.includes(STRICT_LITERAL_IDS);
  for (const m of text.matchAll(ACCESSORS)) {
    callSites++;
    const after = text.slice(m.index + m[0].length);
    const lit = /^\s*(["'])([^"']+)\1\s*[),]/.exec(after);
    if (lit) { referenced.add(lit[2]); continue; }
    /* kit.jsx defines claimText(id); its own signature is not a call site. */
    if (/^\s*id\s*\)/.test(after)) { callSites--; continue; }
    if (!strict) continue;
    const line = text.slice(0, m.index).split(/\r?\n/).length;
    findings.push({ file: rel, line, match: m[1],
      why: "claim id is not a string literal, so no build step can prove it is registered",
      text: (m[0] + after.slice(0, 60)).replace(/\s+/g, " ") });
  }

  for (const m of text.matchAll(/<(?:window\.)?MT_Hint\b[^>]*?\bid="([^"]+)"/g)) referenced.add(m[1]);
  for (const m of text.matchAll(/<Hint\b[^>]*?\bid="([^"]+)"/g)) referenced.add(m[1]);

  /* THE SENTINEL ITSELF, WHEREVER IT IS TYPED. claims.js returns "UNREGISTERED CLAIM (id)" and
     "CLAIM ERROR" at runtime for an id it does not hold; either string written into a component
     would put that text on screen with no registry lookup behind it at all. */
  if (strict) {
    for (const m of text.matchAll(/UNREGISTERED CLAIM|CLAIM ERROR/g)) {
      const line = text.slice(0, m.index).split(/\r?\n/).length;
      findings.push({ file: rel, line, match: m[0],
        why: "the registry's own failure sentinel, written into a surface — it is a runtime value, never a literal",
        text: m[0] });
    }
  }
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

console.log(`[claims] provenance audit clean · ${files.length} files · ${defined.size} registered `
  + `claims · ${referenced.size} referenced across ${callSites} call site(s), every id literal `
  + "and registered");
