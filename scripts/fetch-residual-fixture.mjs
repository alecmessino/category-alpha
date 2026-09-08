#!/usr/bin/env node
/* PRESERVE THE PRODUCTS THE TRACK-RESIDUAL FIXTURE IS PINNED TO.
 *
 * WHY THIS EXISTS. The concept brief this module replaces printed a worked example over
 * Hurricane Lowell (EP122026) and called the metric validated. Three of its numbers are wrong
 * (see docs/TRACK-RESIDUAL.md §2), and the reason they went unnoticed is that nobody could
 * check them: the example quoted a TABLE, not a product. A table cannot be re-read.
 *
 * So the fixture is the PRODUCTS, byte for byte, with the URL they came from, the moment they
 * were retrieved and a SHA-256 of what arrived. Every number in the corrected worked example is
 * recomputed from these bytes by scripts/test-track-residual.mjs, so a claim in the write-up
 * that drifts from the product it cites fails a gate rather than aging quietly into folklore.
 *
 * FOUR PRODUCTS, AND THEY ARE NOT INTERCHANGEABLE. The brief blended two of them:
 *
 *   fstadv.046   TCM 46   the forecast/advisory   — INIT 07/1500Z 17.5N 162.6W, POSITION
 *                                                   ACCURATE WITHIN 15 NM, motion 025/12 KT,
 *                                                   and the FORECAST VALID rows that ARE the
 *                                                   baseline this module measures against
 *   public.046   TCP 46   the public advisory     — the same 1500Z position in MPH
 *   public_a.046 TCP 46A  the intermediate        — 18.0N 162.1W at 1800Z, motion 030/15 MPH,
 *                                                   centre located BY AIRCRAFT (a different
 *                                                   centre definition from a Dvorak estimate)
 *   discus.046   TCD 46   the discussion          — "initial motion ... 025/12 kt", and the
 *                                                   forecaster's own note that guidance had
 *                                                   shifted ~30 n mi east
 *
 * TCM 46 prints knots, TCP 46A prints mph, and they are six hours and one aircraft apart. The
 * brief quoted "030/15" against a 12 kt motion as though they described the same thing.
 *
 * The f-deck is fetched too, because it is the only file that says what the centre fixes in the
 * window actually WERE — an aircraft centre drop, two subjective Dvorak fixes from two agencies
 * off the same GOES-18 image, one objective Dvorak, one microwave pass. That list is what makes
 * the source-dependence rule in §4 a measurement rather than an assertion.
 *
 * Run: node scripts/fetch-residual-fixture.mjs            (network-bound; not in any workflow)
 *      node scripts/fetch-residual-fixture.mjs --check    (re-fetch and compare hashes only)
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "scripts/fixtures/lowell-ep122026");
const CHECK = process.argv.includes("--check");
/* ONE KEY ONLY, so a product can be added without refetching the rest.
   THE ARCHIVED .shtml PRODUCTS ARE IMMUTABLE; THE LIVE DECKS ARE NOT. fdeck.dat and bdeck.dat are
   SNAPSHOTS of files NHC is still appending to, so a blind re-run rewrites them and every hash
   that depended on them. Use --only to touch one entry and leave the snapshots alone. */
const ONLY = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? process.argv[i + 1] : null; })();
const wanted = (key) => !ONLY || ONLY === key;

/* The archive path is stable and public: /archive/<year>/<basin+cy>/<stem>.<product>.<num>.shtml.
   Advisory 45 and 47 are here for one reason — a baseline RESET is a real event in this module
   and the test needs two adjacent official baselines to prove a trend is not continued across
   one. */
const STORM = { id: "EP122026", name: "LOWELL", year: 2026, stem: "ep122026", dir: "ep12" };
const PRODUCTS = [
  { key: "tcm-046", product: "fstadv",   num: "046", label: "TCM 46 — forecast/advisory" },
  { key: "tcp-046", product: "public",   num: "046", label: "TCP 46 — public advisory" },
  { key: "tcp-046a", product: "public_a", num: "046", label: "TCP 46A — intermediate public advisory" },
  { key: "tcd-046", product: "discus",   num: "046", label: "TCD 46 — discussion" },
  { key: "tcp-047", product: "public",   num: "047", label: "TCP 47 — the advisory that supersedes 46" },
  { key: "tcm-045", product: "fstadv",   num: "045", label: "TCM 45 — the superseded baseline" },
  { key: "tcm-047", product: "fstadv",   num: "047", label: "TCM 47 — the baseline that supersedes 46" },
];
const FDECK = { key: "fdeck", url: "https://ftp.nhc.noaa.gov/atcf/fix/fep122026.dat",
                label: "f-deck — every centre fix filed for this storm" };
const BDECK = { key: "bdeck", url: "https://ftp.nhc.noaa.gov/atcf/btk/bep122026.dat",
                label: "b-deck — working best track" };

const archiveUrl = (p) =>
  `https://www.nhc.noaa.gov/archive/${STORM.year}/${STORM.dir}/${STORM.stem}.${p.product}.${p.num}.shtml`;

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/* NHC's archive wraps the transmitted product in a single <pre>. Everything outside it is site
   chrome that changes when the website is redesigned, so the fixture keeps the product text
   separately AND hashes the served page — a chrome-only change is then visibly a chrome-only
   change rather than a fixture that silently no longer matches. */
function extractPre(html) {
  const m = /<pre>([\s\S]*?)<\/pre>/i.exec(html || "");
  if (!m) return null;
  return m[1]
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\r\n/g, "\n").trim() + "\n";
}

/* The product's own header lines. Parsed here rather than in the library because the library
   must never depend on a network shape — it is handed products, it does not go looking. */
function headerOf(text) {
  const issued = /^\s*(\d{3,4})\s+(UTC|AM|PM)\s+(HST|UTC|EDT|CDT|MDT|PDT|AST)?\s*([A-Z]{3})\s+([A-Z]{3})\s+(\d{2})\s+(\d{4})\s*$/im.exec(text || "");
  const valid = /(?:CENTER LOCATED NEAR|located\s*\n?\s*near)\s+([\d.]+)\s*([NS])[,\s]+(?:longitude\s+)?([\d.]+)\s*([EW])(?:\s+AT\s+(\d{2})\/(\d{4})Z)?/i.exec(text || "");
  const within = /POSITION ACCURATE WITHIN\s+(\d+)\s*NM/i.exec(text || "");
  const motionKt = /PRESENT MOVEMENT TOWARD [^\n]*?\bOR\s+(\d+)\s+DEGREES AT\s+(\d+)\s*KT/i.exec(text || "");
  const motionMph = /PRESENT MOVEMENT\.\.\.[A-Z]+ OR\s+(\d+)\s+DEGREES AT\s+(\d+)\s*MPH/i.exec(text || "");
  return {
    issuedLine: issued ? issued[0].trim() : null,
    positionAccuracyText: within ? within[0].trim() : null,
    positionAccuracyNm: within ? Number(within[1]) : null,
    motionText: motionKt ? motionKt[0].trim() : (motionMph ? motionMph[0].trim() : null),
    motionDeg: motionKt ? Number(motionKt[1]) : (motionMph ? Number(motionMph[1]) : null),
    motionKt: motionKt ? Number(motionKt[2]) : null,
    motionMph: motionMph ? Number(motionMph[2]) : null,
    centerText: valid ? valid[0].replace(/\s+/g, " ").trim() : null,
  };
}

async function get(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return await r.text();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const retrievedZ = new Date().toISOString();
  const entries = [];

  for (const p of PRODUCTS) {
    if (!wanted(p.key)) continue;
    const url = archiveUrl(p);
    const html = await get(url);
    const text = extractPre(html);
    if (!text) throw new Error(`${url}: no <pre> in the served page — the archive layout changed`);
    if (!CHECK) await writeFile(join(OUT, `${p.key}.txt`), text, "utf8");
    entries.push({
      key: p.key, label: p.label, url, product: p.product, advisoryNumber: p.num,
      file: `${p.key}.txt`, retrievedZ,
      servedSha256: sha256(html), productSha256: sha256(text), productBytes: Buffer.byteLength(text),
      header: headerOf(text),
    });
    process.stdout.write(`  ${p.key.padEnd(9)} ${sha256(text).slice(0, 16)}  ${url}\n`);
  }

  for (const d of [FDECK, BDECK]) {
    if (!wanted(d.key)) continue;
    const text = await get(d.url);
    if (!CHECK) await writeFile(join(OUT, `${d.key}.dat`), text, "utf8");
    entries.push({ key: d.key, label: d.label, url: d.url, file: `${d.key}.dat`, retrievedZ,
                   servedSha256: sha256(text), productSha256: sha256(text),
                   productBytes: Buffer.byteLength(text), header: null });
    process.stdout.write(`  ${d.key.padEnd(9)} ${sha256(text).slice(0, 16)}  ${d.url}\n`);
  }

  /* FIRST AVAILABILITY, TO THE MINUTE, FOR THE CURRENT SEASON.
     The archived messages/ index that lib/advisories.mjs reads does not exist for a season
     still in progress. NHC's live adv/ directory carries the same information in a different
     shape: one ep122026_info_YYYYMMDDHHMM.xml per transmission, whose FILENAME is the send
     time. Measured on Lowell, advisory 46 went out at 07/1451Z against a nominal 1500Z — NINE
     MINUTES EARLY — and 46A at 07/1744Z against 1800Z. The nominal hour is not a proxy for
     availability in either direction, which is the entire reason this block exists. */
  const advIdx = ONLY ? null : await get("https://ftp.nhc.noaa.gov/atcf/adv/");
  const stamps = advIdx == null ? [] : [...new Set([...advIdx.matchAll(/ep122026_info_(\d{12})\.xml/g)].map((m) => m[1]))].sort();
  const transmissions = [];
  for (const stamp of stamps) {
    if (!/^202609070[89]|^2026090[78][012]/.test(stamp)) continue;   // the window around adv 45-47
    const url = `https://ftp.nhc.noaa.gov/atcf/adv/ep122026_info_${stamp}.xml`;
    const xml = await get(url);
    const num = /<advisoryNumber>([^<]+)<\/advisoryNumber>/.exec(xml);
    const type = /<messageType>([^<]+)<\/messageType>/.exec(xml);
    const validZ = /<messageDateTimeUTC24>(\d{14})<\/messageDateTimeUTC24>/.exec(xml);
    const v = validZ ? `${validZ[1].slice(0,4)}-${validZ[1].slice(4,6)}-${validZ[1].slice(6,8)}T${validZ[1].slice(8,10)}:${validZ[1].slice(10,12)}:00.000Z` : null;
    const t = `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:00.000Z`;
    transmissions.push({ advisoryNumber: num ? num[1] : null, messageType: type ? type[1] : null,
                         nominalValidZ: v, firstAvailableZ: t, url, sha256: sha256(xml),
                         offsetMinFromNominal: v ? Math.round((Date.parse(t) - Date.parse(v)) / 60000) : null });
    process.stdout.write(`  adv ${(num ? num[1] : "?").padEnd(5)} nominal ${v} -> sent ${t}\n`);
  }

  /* ONE PRODUCT FROM A DIFFERENT STORM, PRESERVED FOR ONE REASON.
     ep122022's 6 PM MDT intermediate carries "0000 UTC" — a local date and a UTC date that are
     not the same day. It is the case that broke parsePublicAdvisory and it is not reachable from
     any Lowell product, because both of Lowell's intermediates are morning HST. A regression test
     needs the real bytes, not a hand-built imitation of them. */
  if (wanted("tcp-evening-mdt")) {
    const url = "https://ftp.nhc.noaa.gov/atcf/archive/2022/messages/ep122022.public_a.006.09052344";
    const text = await get(url);
    if (!CHECK) await writeFile(join(OUT, "tcp-evening-mdt.txt"), text, "utf8");
    entries.push({ key: "tcp-evening-mdt", label: "TCP 6A (ep122022) — an evening MDT intermediate, "
                     + "where the local date and the UTC date differ",
                   url, product: "public_a", advisoryNumber: "006", file: "tcp-evening-mdt.txt",
                   retrievedZ, servedSha256: sha256(text), productSha256: sha256(text),
                   productBytes: Buffer.byteLength(text), header: null });
    process.stdout.write(`  ${"tcp-evening-mdt".padEnd(9)} ${sha256(text).slice(0, 16)}  ${url}\n`);
  }

  const manifest = {
    storm: STORM,
    retrievedZ,
    /* THE ONE THING THIS FILE ASSERTS. The products below were retrieved from NHC's public
       archive and are reproduced unmodified. Everything computed from them is computed in
       scripts/lib/track-residual*.mjs and asserted in scripts/test-track-residual.mjs. The
       concept brief's own table is NOT here and is not a fixture. */
    status: "VERIFIED_ORIGINAL_PRODUCTS",
    transmissions,
    note: "Retrieved from the NHC public archive. Product text is the contents of the served "
        + "page's single <pre> element, entity-decoded, CRLF normalised, trailing whitespace "
        + "trimmed. servedSha256 hashes the whole page; productSha256 hashes the text kept here.",
    entries,
  };

  const path = join(OUT, "manifest.json");
  if (CHECK) {
    const prev = JSON.parse(await readFile(path, "utf8"));
    let bad = 0;
    for (const e of entries) {
      const was = prev.entries.find((x) => x.key === e.key);
      if (!was) { console.log(`  NEW      ${e.key}`); continue; }
      if (was.productSha256 !== e.productSha256) { bad++; console.log(`  CHANGED  ${e.key}: ${was.productSha256} -> ${e.productSha256}`); }
    }
    console.log(bad ? `\n${bad} product(s) changed upstream.` : "\nEvery preserved product still hashes to what the manifest recorded.");
    process.exit(bad ? 1 : 0);
  }
  if (ONLY) {
    /* Merge: keep every entry and the transmission list already recorded, replacing only the
       entry named. A partial run must never silently shrink the manifest. */
    const prev = JSON.parse(await readFile(path, "utf8"));
    const merged = { ...prev };
    for (const e of entries) {
      const i = merged.entries.findIndex((x) => x.key === e.key);
      if (i >= 0) merged.entries[i] = e; else merged.entries.push(e);
    }
    await writeFile(path, JSON.stringify(merged, null, 2) + "\n", "utf8");
    console.log(`\nMerged ${entries.length} entry into ${path}`);
    return;
  }
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${entries.length} products + manifest to ${OUT}`);
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
