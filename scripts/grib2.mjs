/* A GRIB2 reader, scoped to exactly what NCEP serves for 10 m winds and no further.
 *
 * The probe settled what this had to handle before a line of it was written: the NOMADS
 * subset comes back as edition 2, grid template 3.0 (regular lat/lon) and data template
 * 5.0 (simple packing), 641x181, two messages, 348 KB. That is the easy corner of a
 * famously unpleasant format, and it is why this is ~150 lines of JavaScript instead of
 * an apt-get for eccodes inside the job that publishes the board every ten minutes.
 *
 * It reads only those templates and REFUSES anything else rather than guessing. A decoder
 * that silently mis-reads complex packing would produce a plausible-looking wind field
 * that is wrong, which is the worst possible failure for a layer whose entire purpose is
 * that it is not invented.
 *
 * Spec offsets are 1-based in the GRIB2 documentation and 0-based here; every one is
 * commented with its spec octet so the two can be checked against each other.
 */

const SECTION_END = "7777";

/* Sign-magnitude, not two's complement. GRIB2 stores the scale factors with the sign in
   the top bit, so a plain readInt16BE silently turns -1 into 32767 and the field comes out
   scaled by 10^32767. It renders as a blank map rather than an obviously wrong one. */
function signMag16(buf, off) {
  const raw = buf.readUInt16BE(off);
  const v = raw & 0x7fff;
  return raw & 0x8000 ? -v : v;
}
function signMag32(buf, off) {
  const raw = buf.readUInt32BE(off);
  const v = raw & 0x7fffffff;
  return raw & 0x80000000 ? -v : v;
}

/* Values are packed as an unpadded big-endian bit stream: `bits` wide, back to back,
   no alignment. Reading it a byte at a time and masking is the whole algorithm. */
function unpackBits(buf, start, count, bits) {
  const out = new Float64Array(count);
  if (bits === 0) return out;                      // constant field: every value is R
  let bitPos = start * 8;
  for (let i = 0; i < count; i++) {
    let v = 0;
    for (let b = 0; b < bits; b++) {
      const byte = buf[bitPos >> 3];
      const bit = (byte >> (7 - (bitPos & 7))) & 1;
      v = v * 2 + bit;
      bitPos++;
    }
    out[i] = v;
  }
  return out;
}

/* Split a buffer into GRIB2 messages. Each begins "GRIB" and declares its own length, so
   a concatenation of messages — which is exactly what the NOMADS filter returns — needs
   no separator handling. */
export function splitMessages(buf) {
  const msgs = [];
  let off = 0;
  while (off + 16 <= buf.length) {
    if (buf.slice(off, off + 4).toString("latin1") !== "GRIB") break;
    const total = Number(buf.readBigUInt64BE(off + 8));
    if (!total || off + total > buf.length) break;
    msgs.push(buf.slice(off, off + total));
    off += total;
  }
  return msgs;
}

export function decodeMessage(msg) {
  if (msg.slice(0, 4).toString("latin1") !== "GRIB") throw new Error("not a GRIB message");
  const edition = msg[7];                                   // octet 8
  if (edition !== 2) throw new Error("GRIB edition " + edition + " is not supported");
  const discipline = msg[6];                                // octet 7

  const out = { discipline, edition };
  let p = 16;                                               // section 0 is 16 octets
  while (p + 5 <= msg.length) {
    if (msg.slice(p, p + 4).toString("latin1") === SECTION_END) break;
    const len = msg.readUInt32BE(p);
    const num = msg[p + 4];
    if (!len || len < 5) throw new Error("bad section length at " + p);

    if (num === 1) {                                        // identification
      out.centre = msg.readUInt16BE(p + 5);                 // octets 6-7
      out.refTime = new Date(Date.UTC(
        msg.readUInt16BE(p + 12),                           // octets 13-14 year
        msg[p + 14] - 1,                                    // octet 15 month
        msg[p + 15],                                        // octet 16 day
        msg[p + 16], msg[p + 17], msg[p + 18]));            // octets 17-19 h/m/s
    }

    if (num === 3) {                                        // grid definition
      const tmpl = msg.readUInt16BE(p + 12);                // octets 13-14
      out.gridTemplate = tmpl;
      if (tmpl !== 0) throw new Error("grid template 3." + tmpl + " is not supported (need 3.0 regular lat/lon)");
      out.nx = msg.readUInt32BE(p + 30);                    // octets 31-34 Ni
      out.ny = msg.readUInt32BE(p + 34);                    // octets 35-38 Nj
      out.la1 = signMag32(msg, p + 46) / 1e6;               // octets 47-50
      out.lo1 = signMag32(msg, p + 50) / 1e6;               // octets 51-54
      out.la2 = signMag32(msg, p + 55) / 1e6;               // octets 56-59
      out.lo2 = signMag32(msg, p + 59) / 1e6;               // octets 60-63
      out.dx = msg.readUInt32BE(p + 63) / 1e6;              // octets 64-67 Di
      out.dy = msg.readUInt32BE(p + 67) / 1e6;              // octets 68-71 Dj
      out.scanMode = msg[p + 71];                           // octet 72
    }

    if (num === 4) {                                        // product definition
      out.productTemplate = msg.readUInt16BE(p + 7);        // octets 8-9
      out.category = msg[p + 9];                            // octet 10
      out.parameter = msg[p + 10];                          // octet 11
    }

    if (num === 5) {                                        // data representation
      out.points = msg.readUInt32BE(p + 5);                 // octets 6-9
      const tmpl = msg.readUInt16BE(p + 9);                 // octets 10-11
      out.dataTemplate = tmpl;
      if (tmpl !== 0) {
        throw new Error("data template 5." + tmpl + " is not supported — only 5.0 simple packing. "
          + "Refusing rather than guessing: a mis-read field looks plausible and is wrong.");
      }
      out.R = msg.readFloatBE(p + 11);                      // octets 12-15 reference value
      out.E = signMag16(msg, p + 15);                       // octets 16-17 binary scale
      out.D = signMag16(msg, p + 17);                       // octets 18-19 decimal scale
      out.bits = msg[p + 19];                               // octet 20
    }

    if (num === 6) {                                        // bitmap
      const ind = msg[p + 5];                               // octet 6
      /* 255 means "no bitmap", which is what NCEP sends for a full lat/lon field. Any
         other value means some points are missing and the packed stream is shorter than
         the grid — handling that wrongly shifts every value after the first gap. */
      if (ind !== 255) throw new Error("bitmapped fields are not supported (indicator " + ind + ")");
    }

    if (num === 7) {                                        // data
      out._dataStart = p + 5;
    }

    p += len;
  }

  if (out._dataStart == null || out.points == null) throw new Error("message carried no data section");

  const raw = unpackBits(msg, out._dataStart, out.points, out.bits);
  const scale = Math.pow(2, out.E) / Math.pow(10, out.D);
  const ref = out.R / Math.pow(10, out.D);
  const values = new Float32Array(out.points);
  for (let i = 0; i < out.points; i++) values[i] = ref + raw[i] * scale;
  out.values = values;
  delete out._dataStart;
  return out;
}

export function decode(buf) {
  return splitMessages(buf).map(decodeMessage);
}

/* Build a GRIB2 message from scratch, used only by the tests. A decoder verified against
   fixtures it also produced proves nothing about the format — but it does prove the bit
   unpacking, the sign-magnitude scale factors and the value reconstruction, which is
   where the arithmetic errors live. The format itself is pinned by the live probe. */
export function encodeSimple({ values, nx, ny, la1, lo1, la2, lo2, dx, dy, bits = 12, D = 0, category = 2, parameter = 2, refTime = new Date(Date.UTC(2026, 7, 14, 0, 0, 0)) }) {
  const n = values.length;
  const scaled = values.map((v) => v * Math.pow(10, D));
  const R = Math.min(...scaled);
  const E = 0;
  const ints = scaled.map((v) => Math.round((v - R) / Math.pow(2, E)));
  const dataBytes = Math.ceil((n * bits) / 8);

  const s1 = Buffer.alloc(21); s1.writeUInt32BE(21, 0); s1[4] = 1;
  s1.writeUInt16BE(refTime.getUTCFullYear(), 12);
  s1[14] = refTime.getUTCMonth() + 1; s1[15] = refTime.getUTCDate();
  s1[16] = refTime.getUTCHours(); s1[17] = refTime.getUTCMinutes(); s1[18] = refTime.getUTCSeconds();

  const s3 = Buffer.alloc(72); s3.writeUInt32BE(72, 0); s3[4] = 3;
  s3.writeUInt16BE(0, 12);
  s3.writeUInt32BE(nx, 30); s3.writeUInt32BE(ny, 34);
  const sm32 = (b, o, v) => { const a = Math.abs(Math.round(v * 1e6)); b.writeUInt32BE(v < 0 ? (a | 0x80000000) >>> 0 : a, o); };
  sm32(s3, 46, la1); sm32(s3, 50, lo1); sm32(s3, 55, la2); sm32(s3, 59, lo2);
  s3.writeUInt32BE(Math.round(dx * 1e6), 63); s3.writeUInt32BE(Math.round(dy * 1e6), 67);
  s3[71] = 0;

  const s4 = Buffer.alloc(34); s4.writeUInt32BE(34, 0); s4[4] = 4;
  s4.writeUInt16BE(0, 7); s4[9] = category; s4[10] = parameter;

  const s5 = Buffer.alloc(21); s5.writeUInt32BE(21, 0); s5[4] = 5;
  s5.writeUInt32BE(n, 5); s5.writeUInt16BE(0, 9);
  s5.writeFloatBE(R, 11);
  const sm16 = (b, o, v) => { const a = Math.abs(v); b.writeUInt16BE(v < 0 ? (a | 0x8000) : a, o); };
  sm16(s5, 15, E); sm16(s5, 17, D); s5[19] = bits;

  const s6 = Buffer.alloc(6); s6.writeUInt32BE(6, 0); s6[4] = 6; s6[5] = 255;

  const s7 = Buffer.alloc(5 + dataBytes); s7.writeUInt32BE(5 + dataBytes, 0); s7[4] = 7;
  let bitPos = 0;
  for (const v of ints) {
    for (let b = bits - 1; b >= 0; b--) {
      const bit = (v >> b) & 1;
      if (bit) s7[5 + (bitPos >> 3)] |= 1 << (7 - (bitPos & 7));
      bitPos++;
    }
  }

  const body = Buffer.concat([s1, s3, s4, s5, s6, s7, Buffer.from("7777", "latin1")]);
  const s0 = Buffer.alloc(16);
  s0.write("GRIB", 0, "latin1"); s0[6] = 0; s0[7] = 2;
  s0.writeBigUInt64BE(BigInt(16 + body.length), 8);
  return Buffer.concat([s0, body]);
}
