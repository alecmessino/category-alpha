"""NHC's GRAPHICAL Tropical Weather Outlook -- the only source of disturbance POSITIONS.

WHY THIS EXISTS. The TWO text gives a probability and a prose location ("well to the
east-southeast of the Hawaiian Islands"). It carries NO COORDINATES. An analog query needs a
latitude and longitude, and turning that prose into numbers would be inventing data -- the one
thing this archive must never do. NHC publishes the polygons it actually draws, in
gtwo_shapefiles.zip, with a .dbf carrying basin, area number and both formation probabilities.
That is a published position, and it joins to the parsed text on (basin, area number).

The JavaScript side of this repo already reads the same product (scripts/lib/shapefile.mjs);
this is the Python reader for the archive, and it uses the standard library's zipfile rather
than reimplementing deflate.

THE COVERAGE LIMIT, STATED UP FRONT: this product is published for the CURRENT outlook only.
There is no historical archive of GTWO shapefiles. So positions exist for disturbances the
daily pipeline observes going forward, and NOT for the historical TWO text back-fill. Every
back-filled disturbance therefore carries lat/lon NULL, and that is recorded as a gap rather
than papered over with a geocoded guess.
"""

from __future__ import annotations

import io
import struct
import zipfile

# Shapefile geometry types we accept. The GTWO areas layer is polygons; the lines and points
# layers are usually empty placeholders.
SHP_NULL, SHP_POINT, SHP_POLYLINE, SHP_POLYGON = 0, 1, 3, 5


def _read_dbf(data: bytes) -> list[dict]:
    """Minimal dBASE III reader -- enough for NHC's attribute tables."""
    if len(data) < 32:
        return []
    n_records, header_len, record_len = struct.unpack("<IHH", data[4:12])
    fields = []
    pos = 32
    while pos < header_len - 1 and data[pos] != 0x0D:
        name = data[pos:pos + 11].split(b"\x00")[0].decode("latin-1").strip()
        ftype = chr(data[pos + 11])
        flen = data[pos + 16]
        fields.append((name, ftype, flen))
        pos += 32
    out = []
    start = header_len
    for i in range(n_records):
        rec = data[start + i * record_len: start + (i + 1) * record_len]
        if not rec or rec[:1] == b"*":       # deleted record marker
            continue
        off = 1
        row = {}
        for name, ftype, flen in fields:
            raw = rec[off:off + flen].decode("latin-1").strip()
            off += flen
            if ftype in "NF":
                try:
                    row[name] = float(raw) if raw not in ("", "-") else None
                except ValueError:
                    row[name] = None
            else:
                row[name] = raw or None
        out.append(row)
    return out


def _read_shp(data: bytes) -> list[dict]:
    """Read shapefile geometry. Returns one dict per record with its rings (lon, lat)."""
    if len(data) < 100:
        return []
    out = []
    pos = 100                                   # fixed 100-byte header
    while pos + 8 <= len(data):
        _num, clen = struct.unpack(">II", data[pos:pos + 8])
        body = data[pos + 8: pos + 8 + clen * 2]
        pos += 8 + clen * 2
        if len(body) < 4:
            continue
        shp_type = struct.unpack("<I", body[:4])[0]
        if shp_type == SHP_NULL:
            out.append({"type": "null", "rings": []})
            continue
        if shp_type == SHP_POINT:
            x, y = struct.unpack("<dd", body[4:20])
            out.append({"type": "point", "rings": [[(x, y)]]})
            continue
        if shp_type not in (SHP_POLYGON, SHP_POLYLINE):
            out.append({"type": f"unsupported:{shp_type}", "rings": []})
            continue
        n_parts, n_points = struct.unpack("<II", body[36:44])
        parts = list(struct.unpack("<%dI" % n_parts, body[44:44 + 4 * n_parts]))
        pt_off = 44 + 4 * n_parts
        pts = struct.unpack("<%dd" % (2 * n_points), body[pt_off: pt_off + 16 * n_points])
        coords = [(pts[2 * i], pts[2 * i + 1]) for i in range(n_points)]
        rings = []
        for i, s in enumerate(parts):
            e = parts[i + 1] if i + 1 < len(parts) else n_points
            rings.append(coords[s:e])
        out.append({"type": "polygon" if shp_type == SHP_POLYGON else "polyline",
                    "rings": rings})
    return out


def _centroid(rings: list) -> tuple | None:
    """Area-weighted centroid of the outer ring, in (lat, lon).

    A centroid is a DERIVED convenience, not a published position -- the polygon is the
    published thing. Callers that need to be exact should use the rings.
    """
    if not rings or len(rings[0]) < 3:
        return None
    ring = rings[0]
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(a) < 1e-12:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return (sum(ys) / len(ys), sum(xs) / len(xs))
    a *= 0.5
    return (cy / (6 * a), cx / (6 * a))          # (lat, lon)


def read_areas(zip_bytes: bytes) -> list[dict]:
    """Parse gtwo_shapefiles.zip -> one dict per outlook area.

    Returns {basin, area_number, prob_48h_pct, prob_7d_pct, lat, lon, rings, issuance_stamp,
    attributes}. Field names in NHC's .dbf have changed before (PROB2DAY -> PROB48HR and the
    5-day column became 7-day in 2023), so lookup is tolerant of several spellings and reports
    None rather than guessing when none match.
    """
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    names = zf.namelist()
    shp = next((n for n in names if n.endswith(".shp") and "areas" in n), None)
    dbf = next((n for n in names if n.endswith(".dbf") and "areas" in n), None)
    if not shp or not dbf:
        return []
    stamp = shp.split("_")[-1].replace(".shp", "")
    geoms = _read_shp(zf.read(shp))
    attrs = _read_dbf(zf.read(dbf))

    def pick(row, *cands):
        for c in cands:
            for k in row:
                if k.upper() == c:
                    return row[k]
        return None

    def pct(v):
        """NHC publishes these as character fields ('70%', 'Low', 'near 0 percent').

        Only a value that actually parses as a number becomes a number; anything else becomes
        None. A label like 'Low' is a real publication but it is not a percentage, and coercing
        it to one would be inventing precision the product did not carry.
        """
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        t = str(v).strip().rstrip("%").strip()
        try:
            return float(t)
        except ValueError:
            return None

    out = []
    for i, row in enumerate(attrs):
        g = geoms[i] if i < len(geoms) else {"rings": []}
        c = _centroid(g.get("rings") or [])
        out.append({
            "basin": pick(row, "BASIN"),
            "area_number": pick(row, "AREA", "AREAID", "ID", "NUMBER"),
            "prob_48h_pct": pct(pick(row, "PROB48HR", "PROB2DAY")),
            "prob_48h_label": pick(row, "RISK2DAY", "RISK48HR"),
            "prob_7d_pct": pct(pick(row, "PROB7DAY", "PROB5DAY")),
            "prob_7d_label": pick(row, "RISK7DAY", "RISK5DAY"),
            "lat": c[0] if c else None,
            "lon": c[1] if c else None,
            "rings": g.get("rings") or [],
            "issuance_stamp": stamp,
            "attributes": row,
        })
    return out


if __name__ == "__main__":
    import sys
    from pathlib import Path

    raw = Path(sys.argv[1]).read_bytes()
    for a in read_areas(raw):
        print(f"basin={a['basin']} area={a['area_number']} "
              f"48h={a['prob_48h_pct']} 7d={a['prob_7d_pct']} "
              f"centroid=({a['lat']}, {a['lon']}) rings={len(a['rings'])} "
              f"pts={sum(len(r) for r in a['rings'])}")
        print(f"   attrs: {a['attributes']}")
