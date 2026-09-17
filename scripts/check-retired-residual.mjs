/* THE RETIRED LOWELL RESULT MUST NOT RENDER AS A CURRENT FIGURE, ANYWHERE UNDER docs/.
 *
 * WHAT WAS RETIRED. A Lowell 18Z track residual of 0.0 nm along-track and +13.6 nm
 * cross-track, read as "timing verified exactly, the error was purely lateral". It is wrong
 * twice over:
 *
 *   1. It took the 15Z release as forecast hour zero. The forecast belongs to the 12Z
 *      nominal cycle -- the archived discussion labels the 08/0000Z row 12H while printing
 *      INIT at 07/1500Z, which is +12 h from 12Z and +9 h from 15Z. Forecast lead is
 *      valid - nominal_cycle, and nothing else.
 *   2. It projected an eastward displacement onto one axis. On a 023 deg heading an
 *      eastward displacement has a component on BOTH axes, so a 0.0 along-track term is an
 *      artefact of the construction rather than a measurement.
 *
 * WHY A GATE AND NOT A DELETION. The record is supposed to say what it retired and why --
 * a correction that erases its own subject cannot be audited. So the rule is not "these
 * digits must not appear". It is: EVERY occurrence must sit inside a withdrawal, close
 * enough that no reader can take it for a live number.
 *
 * WHY IT SCANS docs/ RATHER THAN A LIST OF PAGES. docs/ is the Pages root; anything under
 * it is served whether or not it is linked from anywhere. /preview/track-residual/ returns
 * 200 today and is linked from no index. A gate that checks only the pages someone
 * remembered to list is a gate that the next unlisted page walks straight past.
 *
 * Run: node scripts/check-retired-residual.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DOCS = join(ROOT, "docs");

/* Text-bearing published files. A PDF is binary here; its text is gated where it is built,
   by scripts/risk/gates.py, which reads the rendered page rather than the bytes. */
const TEXTUAL = new Set([".html", ".htm", ".json", ".md", ".js", ".mjs", ".css", ".txt", ".svg"]);

/* The retired figure, in the spellings a published surface actually uses: ASCII hyphen and
   Unicode minus, "nm" attached or spaced, JSON numeric fields. */
const CLAIMS = [
  { id: "along-0.0", re: /0\.0\s*nm\s*along[- ]track/gi },
  { id: "along-0.0-rev", re: /along[- ]track[^.\n]{0,24}?\b0\.0\s*nm/gi },
  { id: "pair-0.0/13.6", re: /0\.0[^\n]{0,60}?[+−-]?13\.6\s*nm\s*cross/gi },
];

/* A withdrawal marker near an occurrence is what makes it legible as retired. The window is
   generous on purpose: the point is that a reader meets the retraction, not that the words
   sit in a particular order. */
const WITHDRAWN = /\b(withdraw|withdrawn|retired|retire|rejected|superseded|supersedes|corrected|correction|not a fixture|not evidence|the thing being corrected|does not survive|cannot reappear)\b/i;
const WINDOW = 420;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (TEXTUAL.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

/* SELF-TEST. scripts/lib/deploy-target.mjs is in this repository because a guard that
   could not fail was shipped, read, and believed. So this one is made to fire before it is
   trusted: --self-test runs the same matcher over synthetic surfaces whose verdicts are
   known, and a scanner that passes a surface it must reject fails here instead of in
   production. It touches no file under docs/. */
function selfTest() {
  const MUST_FAIL = [
    ["bare claim", "<p>Residual: 0.0 nm along-track, +13.6 nm cross-track.</p>"],
    ["unicode minus", "<p>along-track 0.0 nm and \u221213.6 nm cross-track</p>"],
    ["far from its retraction",
      "<p>0.0 nm along-track</p>" + "<p>filler</p>".repeat(120) + "<p>withdrawn</p>"],
    ["reversed order", "<td>along-track</td><td>0.0 nm</td>"],
  ];
  const MUST_PASS = [
    ["named as withdrawn",
      "<p>Earlier Millibar 0.0 nm along-track calculation withdrawn after time-base audit.</p>"],
    ["named as the thing being corrected",
      '{"brief":{"alongNm":0,"crossNm":13.6,"note":"The brief\u2019s table. Not a fixture, not evidence \u2014 the thing being corrected."}}'],
    ["unrelated zero", "<p>Carried residual: 0.0 nm along, 0.0 nm cross (forecast as issued).</p>"],
  ];
  const hits = (text) => {
    let n = 0;
    for (const { re } of CLAIMS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const from = Math.max(0, m.index - WINDOW);
        if (!WITHDRAWN.test(text.slice(from, m.index + m[0].length + WINDOW))) n++;
      }
    }
    return n;
  };
  const bad = [];
  for (const [name, text] of MUST_FAIL) if (hits(text) === 0) bad.push(`missed: ${name}`);
  for (const [name, text] of MUST_PASS) if (hits(text) > 0) bad.push(`false positive: ${name}`);
  if (bad.length) {
    console.error("FAIL  the retired-residual scanner does not do what it claims\n");
    for (const b of bad) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log(`PASS  scanner self-test: ${MUST_FAIL.length} rejected, ${MUST_PASS.length} allowed`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const files = walk(DOCS);
const findings = [];
let occurrences = 0;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const { id, re } of CLAIMS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      occurrences++;
      const from = Math.max(0, m.index - WINDOW);
      const context = text.slice(from, m.index + m[0].length + WINDOW);
      if (!WITHDRAWN.test(context)) {
        const line = text.slice(0, m.index).split("\n").length;
        findings.push({ file: relative(ROOT, file), line, claim: id, text: m[0].trim() });
      }
    }
  }
}

/* THE SECOND HALF OF THE PROOF. The retired number is not only a string; it is a value a
   consumer could recompute and publish. Any published JSON that carries a Lowell 18Z
   residual must not carry the retired pair as its own result. A structure that names it as
   what it rejected is fine -- that is the audit trail -- so only live result fields count. */
const LIVE_RESULT_KEYS = new Set(["residualForecastFrame", "residual_vs_revised_fix",
  "residual_vs_first_reported_fix", "result", "current"]);

function scanValues(node, path, file) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanValues(v, `${path}[${i}]`, file));
    return;
  }
  const along = node.alongNm ?? node.along_nm;
  const cross = node.crossNm ?? node.cross_nm;
  if (typeof along === "number" && typeof cross === "number"
      && Math.abs(along) < 0.05 && Math.abs(Math.abs(cross) - 13.6) < 0.05) {
    const owner = path.split(".").filter(Boolean).pop() || "";
    const underRejected = /reject|retired|withdraw|brief|superseded/i.test(path);
    if (LIVE_RESULT_KEYS.has(owner) || !underRejected) {
      findings.push({ file, line: 0, claim: "live 0.0/13.6 residual value", text: path });
    }
  }
  for (const [k, v] of Object.entries(node)) scanValues(v, `${path}.${k}`, file);
}

for (const file of files.filter((f) => f.endsWith(".json"))) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
  scanValues(parsed, "", relative(ROOT, file));
}

const scanned = files.length;
if (findings.length) {
  console.error(`FAIL  the retired Lowell residual can render as a current figure\n`);
  for (const f of findings) {
    console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}  [${f.claim}]  ${f.text}`);
  }
  console.error(`\n${findings.length} unguarded occurrence(s) across ${scanned} published files.`);
  console.error(`Every mention of the retired result must sit inside a withdrawal. See`);
  console.error(`docs/risk/lowell-2026/ for the record that supersedes it.`);
  process.exit(1);
}

console.log(`PASS  retired Lowell residual cannot render as a current figure`);
console.log(`      ${scanned} published files scanned under docs/`);
console.log(`      ${occurrences} mention(s) found, all inside a withdrawal`);
