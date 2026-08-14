#!/usr/bin/env node
/* Surface wind field for the map, from the operational GFS.
 *
 * Cadence is the thing to get right here. GFS runs four times a day — 00/06/12/18Z — so
 * fetching this on the ten-minute refresh loop would re-download a field that changes
 * every six hours, 144 times a day, and commit it each time. It writes only when the
 * CYCLE advances: four files a day, and the repo does not grow by gigabytes to animate
 * some particles.
 *
 * Provenance: this is a model ANALYSIS, not an observation. It goes on the map as a
 * different class of thing from an NHC advisory and the layer says so.
 *
 * Run: node scripts/fetch-wind.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "./grib2.mjs";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/data");
const OUT = resolve(DATA, "wind.json");
const UA = "MillibarTerminal/1.0 (+https://github.com; institutional weather research dashboard)";

/* The water this terminal has markets on: the eastern and central Pacific through the
   Atlantic hurricane belt. Everything outside it is bytes nobody looks at. */
const BOX = { lat0: 0, lat1: 45, lon0: 180, lon1: 340 };
/* 0.25 deg is far finer than a particle animation can show and four times the bytes.
   Every 4th point is 1 degree, which is ~7,400 vectors — plenty for streamlines. */
const STRIDE = Number(process.env.MT_WIND_STRIDE || 4);

const now = new Date();

function candidateCycles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // Analysis publishes ~3.5-4 h after cycle time; step back 5 to be safe.
    const t = new Date(now.getTime() - (i * 6 + 5) * 3600e3);
    const h = Math.floor(t.getUTCHours() / 6) * 6;
    out.push({
      date: `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`,
      cc: String(h).padStart(2, "0"),
    });
  }
  return out;
}

function filterUrl(date, cc) {
  return "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
    + `?file=gfs.t${cc}z.pgrb2.0p25.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on`
    + `&subregion=&leftlon=${BOX.lon0}&rightlon=${BOX.lon1}&toplat=${BOX.lat1}&bottomlat=${BOX.lat0}`
    + `&dir=%2Fgfs.${date}%2F${cc}%2Fatmos`;
}

async function getBuf(url, timeout = 60000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!r.ok) return { ok: false, status: r.status, error: "HTTP " + r.status };
    return { ok: true, status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
  } catch (e) {
    return { ok: false, status: null, error: String(e && e.message || e) };
  } finally { clearTimeout(to); }
}

/* Thin the grid by taking every STRIDE-th row and column. Averaging neighbours would be
   defensible too, but a wind field is already a smooth model product and sampling keeps
   the values EXACTLY what NCEP published — no derived number enters the file. */
export function downsample(field, stride) {
  const nx = Math.floor((field.nx + stride - 1) / stride);
  const ny = Math.floor((field.ny + stride - 1) / stride);
  const out = new Array(nx * ny);
  let k = 0;
  for (let j = 0; j < field.ny; j += stride) {
    for (let i = 0; i < field.nx; i += stride) {
      const v = field.values[j * field.nx + i];
      out[k++] = Math.round(v * 10) / 10;          // 0.1 m/s — finer than the model's skill
    }
  }
  return { nx, ny, dx: field.dx * stride, dy: field.dy * stride, data: out.slice(0, k) };
}

async function main() {
  await mkdir(DATA, { recursive: true });

  let existing = null;
  try { existing = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }

  const attempts = [];
  for (const { date, cc } of candidateCycles(4)) {
    const cycle = `${date}${cc}`;
    /* Already have this cycle: nothing to do, and nothing to commit. This is the whole
       reason the job is cheap enough to sit in the refresh loop at all. */
    if (existing && existing.cycle === cycle) {
      console.log(`wind: cycle ${cycle} already current — no fetch`);
      return;
    }
    const url = filterUrl(date, cc);
    const r = await getBuf(url);
    if (!r.ok) { attempts.push({ cycle, ok: false, error: r.error }); continue; }
    if (r.buf.slice(0, 4).toString("latin1") !== "GRIB") {
      attempts.push({ cycle, ok: false, error: "response was not GRIB2 (" + r.buf.length + " bytes)" });
      continue;
    }

    let msgs;
    try { msgs = decode(r.buf); }
    catch (e) { attempts.push({ cycle, ok: false, error: "decode: " + e.message }); continue; }

    /* Category 2 is momentum; parameter 2 is the u-component and 3 is v. Selecting by
       these rather than by message order means a reordered response cannot silently swap
       the components and rotate every vector by ninety degrees. */
    const u = msgs.find((m) => m.category === 2 && m.parameter === 2);
    const v = msgs.find((m) => m.category === 2 && m.parameter === 3);
    if (!u || !v) { attempts.push({ cycle, ok: false, error: "u/v components not both present" }); continue; }
    if (u.nx !== v.nx || u.ny !== v.ny) { attempts.push({ cycle, ok: false, error: "u and v grids differ" }); continue; }

    const du = downsample(u, STRIDE), dv = downsample(v, STRIDE);
    const header = {
      nx: du.nx, ny: du.ny, lo1: u.lo1, la1: u.la1, dx: du.dx, dy: du.dy,
      refTime: (u.refTime || now).toISOString(),
      scanMode: u.scanMode,
    };
    const speeds = du.data.map((x, i) => Math.hypot(x, dv.data[i]));
    const out = {
      schema: "millibar-wind/1",
      cycle, cycleZ: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${cc}:00:00Z`,
      fetchedAt: now.toISOString(),
      source: "NOAA GFS 0.25° analysis, 10 m wind (NOMADS)",
      kind: "model analysis",         // NOT an observation, and the UI must say so
      box: BOX, stride: STRIDE,
      grid: header,
      maxMs: Math.round(Math.max(...speeds) * 10) / 10,
      /* leaflet-velocity's native shape: two records, each a header plus a flat array in
         grid order. Emitting it directly avoids an adapter that could transpose the grid. */
      fields: [
        { header: Object.assign({ parameterCategory: 2, parameterNumber: 2 }, header), data: du.data },
        { header: Object.assign({ parameterCategory: 2, parameterNumber: 3 }, header), data: dv.data },
      ],
    };
    await writeFile(OUT, JSON.stringify(out) + "\n");
    console.log(`wind: ${cycle} · ${du.nx}x${du.ny} vectors · peak ${out.maxMs} m/s · ${Math.round(JSON.stringify(out).length / 1024)} KB`);
    return;
  }

  /* Nothing usable. Leave whatever is on disk alone — a stale wind field labelled with its
     real cycle time is better than none, and far better than a fabricated one. */
  console.log("wind: no cycle fetched — " + attempts.map((a) => a.cycle + ": " + a.error).join(" · "));
  process.exitCode = 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error("[wind] fatal:", e.message); process.exitCode = 0; });
}
