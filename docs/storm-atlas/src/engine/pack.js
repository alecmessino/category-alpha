/* Reading the Atlas pack.
 *
 * The pack is built by scripts/genesis/build/build_atlas_pack.py and is deliberately not a
 * general format: it is the in-memory layout the Atlas wants, written to disk. Decoding is
 * therefore not parsing. Every numeric column becomes a TypedArray VIEW over the same
 * ArrayBuffer the network delivered -- no copy, no per-row objects, no JSON.parse over 224,153
 * anything. The only allocation is the header, which is a few tens of kilobytes of JSON.
 *
 * WHY VIEWS AND NOT COPIES. 224,153 track points as JS objects is roughly 40 MB of heap and a
 * second of GC pressure; as views it is the 4 MB the buffer already occupies and no work at
 * all. That difference is the whole reason this file exists rather than a fetch of JSON.
 *
 * NULLS ARE IN-BAND. A TypedArray has no null bitmap, so the packer writes a sentinel the
 * column cannot legitimately hold and records it in the header. Every accessor here honours
 * it and returns null -- never 0, never NaN-coerced-to-zero, because "no wind was recorded"
 * and "the wind was zero" are different facts and this archive spends a great deal of effort
 * keeping them apart.
 */

const MAGIC = "MBATLAS1";

const VIEWS = {
  i16: Int16Array,
  i32: Int32Array,
  u8: Uint8Array,
  u16: Uint16Array,
  u32: Uint32Array,
  f64: Float64Array,
};

/** Decode a pack from the raw (already un-gzipped) bytes. */
export function decodePack(buffer) {
  const bytes = new Uint8Array(buffer);
  let magic = "";
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(bytes[i]);
  if (magic !== MAGIC) throw new Error(`not an atlas pack (magic ${JSON.stringify(magic)})`);
  const hdrLen = new DataView(buffer).getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hdrLen)));
  const base = 12 + hdrLen;

  const tables = {};
  for (const [name, spec] of Object.entries(header.tables || {})) {
    tables[name] = new Table(name, spec, buffer, base);
  }
  const indexes = {};
  for (const [name, spec] of Object.entries(header.indexes || {})) {
    indexes[name] = column(spec, buffer, base);
  }
  return { header, tables, indexes };
}

/* A column is its TypedArray plus the metadata needed to read a value honestly: the null
   sentinel, the fixed-point scale, and the string dictionary if it has one. */
function column(spec, buffer, base) {
  const Ctor = VIEWS[spec.dtype];
  if (!Ctor) throw new Error(`unknown column dtype ${spec.dtype}`);
  const array = new Ctor(buffer, base + spec.offset, spec.length);
  return {
    array,
    dtype: spec.dtype,
    scale: spec.scale || null,
    dictionary: spec.dictionary || null,
    nullValue: spec.null === undefined ? null : spec.null,
    unit: spec.unit || null,
    note: spec.note || "",
    length: spec.length,
  };
}

class Table {
  constructor(name, spec, buffer, base) {
    this.name = name;
    this.rows = spec.rows;
    this.note = spec.note || "";
    this.columns = {};
    for (const [c, cs] of Object.entries(spec.columns)) {
      this.columns[c] = column(cs, buffer, base);
    }
  }

  /** The raw TypedArray. Use this in a hot loop; use the accessors below at the edges. */
  raw(name) {
    const c = this.columns[name];
    if (!c) throw new Error(`${this.name} has no column ${name}`);
    return c.array;
  }

  col(name) {
    const c = this.columns[name];
    if (!c) throw new Error(`${this.name} has no column ${name}`);
    return c;
  }

  has(name) {
    return Object.prototype.hasOwnProperty.call(this.columns, name);
  }

  /** A number, or null when the packer wrote the sentinel. Applies the fixed-point scale. */
  num(name, i) {
    const c = this.col(name);
    const v = c.array[i];
    if (c.nullValue !== null && c.nullValue !== "nan" && v === c.nullValue) return null;
    if (c.nullValue === "nan" && Number.isNaN(v)) return null;
    return c.scale ? v / c.scale : v;
  }

  /** A dictionary-encoded string, or null. */
  str(name, i) {
    const c = this.col(name);
    if (!c.dictionary) throw new Error(`${this.name}.${name} is not dictionary-encoded`);
    const code = c.array[i];
    return code === 0 ? null : c.dictionary[code - 1];
  }

  /** true / false / null, from the packer's three-state byte. Null is UNKNOWN, not false. */
  bool(name, i) {
    const v = this.col(name).array[i];
    return v === 0 ? null : v === 2;
  }

  /** A packed time column as JS epoch milliseconds, or null.
   *
   * The unit comes from the column, not from a convention: best-track fixes are packed as
   * minutes because they land on synoptic hours, but landfalls are packed as milliseconds
   * because 997 of them are segment crossings interpolated to the second. Reading either with
   * the other's multiplier would be wrong by up to 59 seconds and would look entirely normal.
   */
  time(name, i) {
    const c = this.col(name);
    const v = this.num(name, i);
    if (v === null) return null;
    if (c.unit === "milliseconds_since_epoch") return v;
    if (c.unit === "minutes_since_epoch") return v * 60000;
    throw new Error(`${this.name}.${name} has no time unit in the pack header`);
  }
}

/* ---- loading -------------------------------------------------------------------------
   Only the browser's loader lives here. Node's -- used by the pack and parity tests -- is in
   node-io.js, which this file must never import: a single `import("node:zlib")` anywhere in
   this module graph pulls a Node builtin into the browser bundle and fails the build. Keeping
   them in separate files makes that structural rather than a rule someone has to remember. */

/** Browser: fetch a .gz and inflate it with the platform's own stream. No zlib dependency. */
export async function fetchPack(url, { signal } = {}) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (typeof DecompressionStream === "undefined") {
    /* Loud rather than silent. Every browser this surface targets has had
       DecompressionStream since 2023; a build that reaches one without it should say so
       rather than render an empty map. */
    throw new Error("this browser has no DecompressionStream; the Atlas pack cannot be read");
  }
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return decodePack(buf);
}
