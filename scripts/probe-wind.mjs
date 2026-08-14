#!/usr/bin/env node
/* Reconnaissance for a surface-wind field. Writes docs/data/wind-probe.json.
 *
 * This exists instead of a design document, because every parser in this project that was
 * designed from assumptions cost two or three cycles and every one that was designed from
 * a captured sample cost one. The question "can we get gridded 10 m winds into this
 * pipeline, and in what shape" is answerable by asking the servers, and the sandbox that
 * writes this code cannot reach them. CI can.
 *
 * Three candidate paths, in descending order of how much I want to be right:
 *
 *  1. NOMADS OpenDAP / GrADS ASCII. Returns a plain-text subset of the GFS grid over HTTP.
 *     If this works, there is NO GRIB2 in this project at all: no binary decoding, no
 *     eccodes or wgrib2 system dependency in the refresh job, no pure-JS GRIB2 parser
 *     wrestling with JPEG2000 packing. That last point is the crux — GFS packs most
 *     fields with template 5.40 (JPEG2000) and there is no credible pure-JS decoder for
 *     it, so "parse GRIB2 in Node" quietly means "add a C toolchain to a job that
 *     currently has zero system dependencies and fails closed if apt does".
 *
 *  2. NOMADS GRIB filter. Server-side subsetting to a small GRIB2 file. Still GRIB2, but
 *     kilobytes rather than the ~500 MB full field.
 *
 *  3. AWS open-data S3 with .idx byte ranges. The most robust and least rate-limited
 *     source, but the rawest: you read an index, compute byte offsets, and range-request
 *     the message. Still leaves the decode problem.
 *
 * Reports what each actually returns rather than what it ought to.
 *
 * Run: node scripts/probe-wind.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/data");
const UA = "MillibarTerminal/1.0 (+https://github.com; institutional weather research dashboard)";
const now = new Date();

/* The most recent GFS cycle that is plausibly published. GFS runs 00/06/12/18Z and the
   analysis appears roughly 3.5-4 h after cycle time, so step back generously. */
function cycles(back) {
  const out = [];
  for (let i = 0; i < back; i++) {
    const t = new Date(now.getTime() - (i * 6 + 5) * 3600e3);
    const h = Math.floor(t.getUTCHours() / 6) * 6;
    const d = t.getUTCFullYear() + String(t.getUTCMonth() + 1).padStart(2, "0") + String(t.getUTCDate()).padStart(2, "0");
    out.push({ date: d, cc: String(h).padStart(2, "0") });
  }
  return out;
}

async function get(url, { range = null, timeout = 45000 } = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { "User-Agent": UA };
    if (range) headers.Range = range;
    const r = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: r.ok, status: r.status, ms: Date.now() - t0, bytes: buf.length, buf,
             text: buf.slice(0, 4000).toString("utf8"), ctype: r.headers.get("content-type") };
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - t0, error: String(e && e.message || e) };
  } finally { clearTimeout(to); }
}

/* GrADS indexes latitude from -90 at 0 and longitude from 0 at 0, both at 0.25 deg.
   The box below covers the central and eastern Pacific plus the Atlantic hurricane belt
   — the only water this terminal has markets on. */
const BOX = { lat0: 0, lat1: 45, lon0: 180, lon1: 340 };
const idx = (v, origin) => Math.round((v - origin) / 0.25);

const results = [];

/* ---- 1. OpenDAP / GrADS ASCII ------------------------------------------- */
for (const { date, cc } of cycles(3)) {
  const la = [idx(BOX.lat0, -90), idx(BOX.lat1, -90)];
  const lo = [idx(BOX.lon0, 0), idx(BOX.lon1, 0)];
  const url = `https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs${date}/gfs_0p25_${cc}z.ascii`
            + `?ugrd10m[0][${la[0]}:${la[1]}][${lo[0]}:${lo[1]}]`;
  const r = await get(url, { follow: false });
  const looksAscii = r.ok && /ugrd10m/i.test(r.text || "") && !/^GRIB/.test(r.text || "");
  const gridLine = r.ok ? (/\[(\d+)\]\[(\d+)\]\[(\d+)\]/.exec(r.text || "") || null) : null;
  results.push({
    path: "opendap-ascii", cycle: date + " " + cc + "Z", url,
    ok: r.ok, status: r.status, ms: r.ms, bytes: r.bytes, ctype: r.ctype, error: r.error || null,
    parses: !!looksAscii,
    dims: gridLine ? gridLine.slice(1).map(Number) : null,
    /* An error page from GrADS is a 200 with prose in it, so the first bytes decide, not
       the status code. */
    head: (r.text || "").slice(0, 300).replace(/\s+/g, " "),
  });
  if (looksAscii) break;
}

/* ---- 2. NOMADS GRIB filter ---------------------------------------------- */
{
  const { date, cc } = cycles(1)[0];
  const url = `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl`
    + `?file=gfs.t${cc}z.pgrb2.0p25.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on`
    + `&subregion=&leftlon=${BOX.lon0}&rightlon=${BOX.lon1}&toplat=${BOX.lat1}&bottomlat=${BOX.lat0}`
    + `&dir=%2Fgfs.${date}%2F${cc}%2Fatmos`;
  const r = await get(url);
  const isGrib = r.ok && r.buf && r.buf.slice(0, 4).toString("latin1") === "GRIB";
  results.push({
    path: "nomads-grib-filter", cycle: date + " " + cc + "Z", url,
    ok: r.ok, status: r.status, ms: r.ms, bytes: r.bytes, ctype: r.ctype, error: r.error || null,
    parses: !!isGrib,
    _buf: isGrib ? r.buf : null,
    note: isGrib ? "real GRIB2 returned — would still need a decoder" : "not GRIB2",
    head: (r.text || "").slice(0, 220).replace(/\s+/g, " "),
  });
}

/* ---- 3. AWS open data, index only --------------------------------------- */
{
  const { date, cc } = cycles(1)[0];
  const base = `https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.${date}/${cc}/atmos/gfs.t${cc}z.pgrb2.0p25.f000`;
  const r = await get(base + ".idx");
  const lines = r.ok ? (r.text || "").split("\n").filter((l) => /UGRD:10 m above ground|VGRD:10 m above ground/.test(l)) : [];
  results.push({
    path: "aws-s3-idx", cycle: date + " " + cc + "Z", url: base + ".idx",
    ok: r.ok, status: r.status, ms: r.ms, bytes: r.bytes, error: r.error || null,
    parses: lines.length >= 2,
    windMessages: lines.slice(0, 2),
    idxSample: r.ok ? (r.text || "").split("\n").slice(0, 6) : null,
    levelsSeen: r.ok ? [...new Set((r.text || "").split("\n").map((l) => (l.split(":")[4] || "")).filter(Boolean))].slice(0, 14) : null,
    note: lines.length >= 2
      ? "index readable — byte ranges available, decode still required"
      : "no 10 m wind messages found in the index",
  });
}

/* ---- 4. What is inside the GRIB2 we can actually get -------------------
   The decisive fact for the whole design. GRIB2 sections are self-describing: a 4-byte
   length, a 1-byte section number, then content. Section 5 carries the Data
   Representation Template number, and that single integer decides the build:
     5.0  simple packing        — a few dozen lines of JS, no dependency
     5.2 / 5.3  complex packing — a few hundred lines, still no dependency
     5.40 JPEG2000              — needs a C codec; pure JS is not realistic
   Walking the section headers is not decoding the field; it reads the envelope only, so
   it is cheap and it cannot be wrong about what the envelope says. */
function inspectGrib2(buf) {
  if (!buf || buf.length < 16 || buf.slice(0, 4).toString("latin1") !== "GRIB") return { grib: false };
  const edition = buf[7];
  const messages = [];
  let off = 0;
  while (off + 16 < buf.length && buf.slice(off, off + 4).toString("latin1") === "GRIB" && messages.length < 4) {
    const total = Number(buf.readBigUInt64BE(off + 8));
    if (!total || off + total > buf.length) break;
    const msg = { bytes: total, sections: {} };
    let p = off + 16;
    while (p + 5 <= off + total) {
      if (buf.slice(p, p + 4).toString("latin1") === "7777") break;
      const len = buf.readUInt32BE(p), num = buf[p + 4];
      if (!len || len < 5) break;
      if (num === 3) {
        msg.sections.gridTemplate = buf.readUInt16BE(p + 12);
        msg.sections.points = buf.readUInt32BE(p + 6);
        if (msg.sections.gridTemplate === 0 && len >= 40) {
          msg.sections.ni = buf.readUInt32BE(p + 30);
          msg.sections.nj = buf.readUInt32BE(p + 34);
        }
      }
      if (num === 4) msg.sections.productTemplate = buf.readUInt16BE(p + 7);
      if (num === 5) {
        msg.sections.dataPoints = buf.readUInt32BE(p + 5);
        msg.sections.dataTemplate = buf.readUInt16BE(p + 9);
      }
      p += len;
    }
    messages.push(msg);
    off += total;
  }
  const t = messages.length ? messages[0].sections.dataTemplate : null;
  return {
    grib: true, edition, messages: messages.length, detail: messages,
    packing: t === 0 ? "simple (5.0)" : t === 2 ? "complex (5.2)" : t === 3 ? "complex + spatial diff (5.3)"
      : t === 40 || t === 40000 ? "JPEG2000 (5.40)" : t === 41 ? "PNG (5.41)" : "template " + t,
    pureJsFeasible: t === 0 || t === 2 || t === 3,
  };
}
const gribRes = results.find((r) => r.path === "nomads-grib-filter");
if (gribRes && gribRes._buf) { gribRes.inside = inspectGrib2(gribRes._buf); delete gribRes._buf; }

const winner = results.find((r) => r.parses) || null;
const out = {
  schema: "millibar-wind-probe/1", ranAt: now.toISOString(), box: BOX,
  verdict: winner ? winner.path : "none of the candidate paths returned usable data",
  gribRequired: !!(winner && winner.path !== "opendap-ascii"),
  results,
};
await mkdir(DATA, { recursive: true });
await writeFile(resolve(DATA, "wind-probe.json"), JSON.stringify(out, null, 2) + "\n");

console.log("wind probe " + out.ranAt);
for (const r of results) {
  console.log(`  ${r.path.padEnd(20)} ${r.ok ? "ok " : "FAIL"} status=${r.status} ${String(r.bytes ?? "-").padStart(8)}B ${r.ms}ms parses=${r.parses}`);
  if (r.inside) console.log(`      INSIDE: edition ${r.inside.edition} · ${r.inside.messages} message(s) · packing ${r.inside.packing} · pure-JS feasible ${r.inside.pureJsFeasible}` + (r.inside.detail && r.inside.detail[0] && r.inside.detail[0].sections.ni ? ` · grid ${r.inside.detail[0].sections.ni}x${r.inside.detail[0].sections.nj}` : ""));
  if (r.levelsSeen) console.log(`      levels in idx: ${r.levelsSeen.join(" | ").slice(0, 200)}`);
  if (r.error) console.log(`      error: ${r.error}`);
  if (r.head) console.log(`      head: ${r.head.slice(0, 190)}`);
  if (r.windMessages) r.windMessages.forEach((l) => console.log(`      idx: ${l}`));
  if (r.dims) console.log(`      grid dims: ${r.dims.join(" x ")}`);
}
console.log("\nverdict: " + out.verdict + (out.gribRequired ? " — GRIB2 decoding WOULD be required" : " — no GRIB2 decoding required"));
