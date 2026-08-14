#!/usr/bin/env node
/* Tests for the GRIB2 reader and the wind downsampler.
 *
 * The format itself is pinned by the live probe: NOMADS returns edition 2, grid template
 * 3.0, data template 5.0, 641x181. What these assert is the arithmetic that sits on top
 * of that — bit unpacking at odd widths, sign-magnitude scale factors, value
 * reconstruction — and, just as importantly, that every unsupported case REFUSES. A
 * decoder that guesses at complex packing yields a plausible wind field that is wrong,
 * and a wrong wind field is indistinguishable from a right one by eye.
 *
 * Run: node scripts/test-grib2.mjs
 */
import { encodeSimple, decode, splitMessages, decodeMessage } from "./grib2.mjs";
import { downsample } from "./fetch-wind.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => ck(n + (JSON.stringify(g) === JSON.stringify(w) ? "" : ""), JSON.stringify(g) === JSON.stringify(w), JSON.stringify(g) === JSON.stringify(w) ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`);

const grid = (nx, ny, f) => { const v = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v.push(f(i, j)); return v; };

console.log("\n[1] a round trip reproduces the values exactly");
const vals = grid(9, 5, (i, j) => -18 + i * 2.5 + j * 0.25);
const buf = encodeSimple({ values: vals, nx: 9, ny: 5, la1: 45, lo1: 180, la2: 44, lo2: 182, dx: 0.25, dy: 0.25, bits: 16, D: 2 });
const [m] = decode(buf);
eq("grid dimensions", [m.nx, m.ny], [9, 5]);
eq("templates", [m.gridTemplate, m.dataTemplate], [0, 0]);
eq("point count", m.points, 45);
ck("every value survives", vals.every((v, i) => Math.abs(m.values[i] - v) < 1e-6),
   "max err " + Math.max(...vals.map((v, i) => Math.abs(m.values[i] - v))).toExponential(2));

console.log("\n[2] the geometry is read, not assumed");
eq("first latitude", m.la1, 45);
eq("first longitude", m.lo1, 180);
eq("grid spacing", [m.dx, m.dy], [0.25, 0.25]);
eq("scan mode", m.scanMode, 0);
eq("parameter identifies the u-component", [m.category, m.parameter], [2, 2]);

console.log("\n[3] negative latitudes use sign-magnitude, not two's complement");
/* GRIB2 puts the sign in the top bit. readInt32BE would turn -20 into a number near
   2^31, which places the grid off the planet — and the map would render blank rather
   than obviously wrong. */
const south = decode(encodeSimple({ values: [1, 2, 3, 4], nx: 2, ny: 2, la1: -20.5, lo1: 300, la2: -21, lo2: 300.5, dx: 0.5, dy: 0.5, bits: 8 }))[0];
eq("southern latitude round-trips", south.la1, -20.5);
ck("and is not a huge positive number", Math.abs(south.la1) < 91, String(south.la1));

console.log("\n[4] odd bit widths unpack correctly — the stream is unpadded");
for (const bits of [1, 5, 7, 11, 12, 17, 23]) {
  const n = 37;
  const vv = grid(n, 1, (i) => i % Math.max(2, Math.floor(Math.pow(2, Math.min(bits, 10)))));
  const d = decode(encodeSimple({ values: vv, nx: n, ny: 1, la1: 10, lo1: 200, la2: 10, lo2: 209, dx: 0.25, dy: 0.25, bits }))[0];
  ck(bits + "-bit values", vv.every((v, i) => Math.abs(d.values[i] - v) < 1e-6),
     "first mismatch at " + vv.findIndex((v, i) => Math.abs(d.values[i] - v) >= 1e-6));
}

console.log("\n[5] a decimal scale factor is applied, and its sign is honoured");
const dec = decode(encodeSimple({ values: [1.23, 4.56, 7.89, 0.01], nx: 2, ny: 2, la1: 5, lo1: 200, la2: 4, lo2: 201, dx: 1, dy: 1, bits: 16, D: 2 }))[0];
ck("two decimal places survive", [1.23, 4.56, 7.89, 0.01].every((v, i) => Math.abs(dec.values[i] - v) < 1e-4),
   [...dec.values].map((v) => v.toFixed(3)).join(" "));

console.log("\n[6] several messages in one buffer are separated by their own lengths");
const two = Buffer.concat([
  encodeSimple({ values: [1, 2, 3, 4], nx: 2, ny: 2, la1: 5, lo1: 200, la2: 4, lo2: 201, dx: 1, dy: 1, bits: 8, parameter: 2 }),
  encodeSimple({ values: [9, 8, 7, 6], nx: 2, ny: 2, la1: 5, lo1: 200, la2: 4, lo2: 201, dx: 1, dy: 1, bits: 8, parameter: 3 }),
]);
eq("two messages found", splitMessages(two).length, 2);
const both = decode(two);
eq("and they carry different parameters", both.map((x) => x.parameter), [2, 3]);
eq("u values", [...both[0].values], [1, 2, 3, 4]);
eq("v values", [...both[1].values], [9, 8, 7, 6]);

console.log("\n[7] anything unsupported REFUSES rather than guessing");
/* This is the point of the whole file. A silently mis-read field is the one failure mode
   that cannot be caught by looking at the map. */
const good = encodeSimple({ values: [1, 2, 3, 4], nx: 2, ny: 2, la1: 5, lo1: 200, la2: 4, lo2: 201, dx: 1, dy: 1, bits: 8 });
const withDataTemplate = (t) => { const b = Buffer.from(good); const p = b.indexOf(Buffer.from([0, 0, 0, 21, 5])); b.writeUInt16BE(t, p + 9); return b; };
for (const t of [2, 3, 40, 41]) {
  let threw = null;
  try { decodeMessage(withDataTemplate(t)); } catch (e) { threw = e.message; }
  ck("data template 5." + t + " is refused", !!threw && /not supported/.test(threw), threw || "DECODED ANYWAY");
}
let gridThrew = null;
try {
  const b = Buffer.from(good); const p = b.indexOf(Buffer.from([0, 0, 0, 72, 3])); b.writeUInt16BE(30, p + 12);
  decodeMessage(b);
} catch (e) { gridThrew = e.message; }
ck("a non lat/lon grid is refused", !!gridThrew && /grid template/.test(gridThrew), gridThrew || "DECODED ANYWAY");
let bmThrew = null;
try {
  const b = Buffer.from(good); const p = b.indexOf(Buffer.from([0, 0, 0, 6, 6])); b[p + 5] = 0;
  decodeMessage(b);
} catch (e) { bmThrew = e.message; }
ck("a bitmapped field is refused", !!bmThrew && /bitmap/.test(bmThrew), bmThrew || "DECODED ANYWAY");
let edThrew = null;
try { const b = Buffer.from(good); b[7] = 1; decodeMessage(b); } catch (e) { edThrew = e.message; }
ck("GRIB edition 1 is refused", !!edThrew && /edition/.test(edThrew), edThrew || "DECODED ANYWAY");
ck("garbage yields no messages rather than throwing", splitMessages(Buffer.from("not grib at all")).length === 0);

console.log("\n[8] downsampling samples published values and never invents one");
const field = { nx: 9, ny: 5, dx: 0.25, dy: 0.25, values: grid(9, 5, (i, j) => i + j * 100) };
const ds = downsample(field, 4);
eq("dimensions shrink by the stride", [ds.nx, ds.ny], [3, 2]);
eq("spacing grows by the stride", [ds.dx, ds.dy], [1, 1]);
eq("values are the sampled originals", ds.data, [0, 4, 8, 400, 404, 408]);
ck("every output value exists in the input — nothing averaged into being",
   ds.data.every((v) => field.values.includes(v)));
const ds1 = downsample(field, 1);
eq("a stride of 1 is a copy", ds1.data.length, 45);

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nall assertions passed\n");
process.exit(fail ? 1 : 0);
